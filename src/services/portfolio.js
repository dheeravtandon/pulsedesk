'use strict';

const fs = require('fs');
const path = require('path');
const { quotes, fxRate } = require('./stocks');

let FILE = null;
let HIST = null;

const DEFAULTS = {
  baseCurrency: 'INR',
  cash: 0,
  holdings: [],
  trades: []
};

function init(userDataDir) {
  FILE = path.join(userDataDir, 'portfolio.json');
  HIST = path.join(userDataDir, 'history.json');
  if (!fs.existsSync(FILE)) write(DEFAULTS);
  return read();
}

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

const uid = () => Math.random().toString(36).slice(2, 10);

function addHolding(h) {
  const p = read();
  const symbol = String(h.symbol || '').trim().toUpperCase();
  if (!symbol) throw new Error('symbol required');
  const qty = Number(h.qty);
  const avgPrice = Number(h.avgPrice);
  if (!isFinite(qty) || qty <= 0) throw new Error('quantity must be > 0');
  if (!isFinite(avgPrice) || avgPrice < 0) throw new Error('average price must be >= 0');

  const existing = p.holdings.find((x) => x.symbol === symbol);
  if (existing) {
    // Weighted-average merge so repeat buys of the same scrip stay one row.
    const totalQty = existing.qty + qty;
    existing.avgPrice = (existing.qty * existing.avgPrice + qty * avgPrice) / totalQty;
    existing.qty = totalQty;
  } else {
    p.holdings.push({ id: uid(), symbol, qty, avgPrice, buyDate: h.buyDate || new Date().toISOString().slice(0, 10) });
  }
  return write(p);
}

function updateHolding(id, patch) {
  const p = read();
  const h = p.holdings.find((x) => x.id === id);
  if (!h) throw new Error('holding not found');
  if (patch.qty != null) h.qty = Number(patch.qty);
  if (patch.avgPrice != null) h.avgPrice = Number(patch.avgPrice);
  if (patch.symbol) h.symbol = String(patch.symbol).trim().toUpperCase();
  return write(p);
}

/** Removing with a sellPrice books the realised P&L into the trade log. */
function removeHolding(id, sellPrice) {
  const p = read();
  const h = p.holdings.find((x) => x.id === id);
  if (h && sellPrice != null && isFinite(Number(sellPrice))) {
    p.trades.push({
      id: uid(),
      symbol: h.symbol,
      qty: h.qty,
      buyPrice: h.avgPrice,
      sellPrice: Number(sellPrice),
      date: new Date().toISOString().slice(0, 10)
    });
  }
  p.holdings = p.holdings.filter((x) => x.id !== id);
  return write(p);
}

function setBase(currency) {
  const p = read();
  p.baseCurrency = String(currency || 'INR').toUpperCase();
  return write(p);
}

function setCash(amount) {
  const p = read();
  p.cash = Number(amount) || 0;
  return write(p);
}

function replace(data) {
  return write({ ...DEFAULTS, ...data });
}

function pushSnapshot(value, pnl) {
  try {
    const hist = fs.existsSync(HIST) ? JSON.parse(fs.readFileSync(HIST, 'utf8')) : [];
    const day = new Date().toISOString().slice(0, 10);
    const last = hist[hist.length - 1];
    const point = { date: day, ts: Date.now(), value, pnl };
    if (last && last.date === day) hist[hist.length - 1] = point;
    else hist.push(point);
    fs.writeFileSync(HIST, JSON.stringify(hist.slice(-400)), 'utf8');
    return hist.slice(-90);
  } catch {
    return [];
  }
}

function history() {
  try {
    return JSON.parse(fs.readFileSync(HIST, 'utf8')).slice(-90);
  } catch {
    return [];
  }
}

async function valuate() {
  const p = read();
  const base = p.baseCurrency || 'INR';
  const symbols = p.holdings.map((h) => h.symbol);

  const q = symbols.length ? await quotes(symbols) : {};
  const currencies = [...new Set(Object.values(q).map((x) => x.currency).filter(Boolean))];
  const fx = { [base]: 1 };
  for (const c of currencies) {
    if (!fx[c]) fx[c] = await fxRate(c, base);
  }

  const rows = p.holdings.map((h) => {
    const quote = q[h.symbol.toUpperCase()] || null;
    const cur = (quote && quote.currency) || base;
    const rate = fx[cur] || 1;
    const price = quote ? quote.price : h.avgPrice;
    const prev = quote ? quote.prevClose : h.avgPrice;
    const invested = h.qty * h.avgPrice * rate;
    const value = h.qty * price * rate;
    const pnl = value - invested;
    const dayPnl = h.qty * (price - prev) * rate;
    return {
      ...h,
      name: (quote && quote.name) || h.symbol,
      exchange: (quote && quote.exchange) || '',
      currency: cur,
      fxRate: rate,
      price,
      prevClose: prev,
      changePct: quote ? quote.changePct : 0,
      invested,
      value,
      pnl,
      pnlPct: invested ? (pnl / invested) * 100 : 0,
      dayPnl,
      series: (quote && quote.series) || [],
      live: !!quote
    };
  });

  const invested = rows.reduce((a, r) => a + r.invested, 0);
  const value = rows.reduce((a, r) => a + r.value, 0);
  const dayPnl = rows.reduce((a, r) => a + r.dayPnl, 0);
  const unrealised = value - invested;
  const realised = (p.trades || []).reduce((a, t) => a + (t.sellPrice - t.buyPrice) * t.qty - (t.fees || 0), 0);

  rows.forEach((r) => (r.weight = value ? (r.value / value) * 100 : 0));
  rows.sort((a, b) => b.value - a.value);

  const winners = rows.filter((r) => r.pnl > 0).length;
  const sorted = [...rows].sort((a, b) => b.pnlPct - a.pnlPct);

  const totals = {
    baseCurrency: base,
    cash: p.cash || 0,
    invested,
    value,
    netWorth: value + (p.cash || 0),
    unrealised,
    unrealisedPct: invested ? (unrealised / invested) * 100 : 0,
    realised,
    totalPnl: unrealised + realised,
    dayPnl,
    dayPnlPct: value - dayPnl ? (dayPnl / (value - dayPnl)) * 100 : 0,
    positions: rows.length,
    winners,
    losers: rows.length - winners,
    best: sorted[0] || null,
    worst: sorted[sorted.length - 1] || null
  };

  const hist = pushSnapshot(Math.round(value), Math.round(unrealised));
  return { totals, rows, trades: p.trades || [], history: hist };
}

module.exports = {
  init, read, replace, addHolding, updateHolding, removeHolding,
  setBase, setCash, valuate, history
};
