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

  const buyTs = Number(h.buyTs) || Date.now();
  const buyDate = h.buyDate || new Date(buyTs).toISOString().slice(0, 10);

  const existing = p.holdings.find((x) => x.symbol === symbol);
  if (existing) {
    // Weighted-average merge so repeat buys of the same scrip stay one row.
    const totalQty = existing.qty + qty;
    existing.avgPrice = (existing.qty * existing.avgPrice + qty * avgPrice) / totalQty;
    existing.qty = totalQty;
    // The oldest purchase is the one the holding period should be measured from.
    if (!existing.buyTs || buyTs < existing.buyTs) {
      existing.buyTs = buyTs;
      existing.buyDate = buyDate;
    }
    existing.lots = (existing.lots || 1) + 1;
  } else {
    p.holdings.push({ id: uid(), symbol, qty, avgPrice, buyTs, buyDate, name: h.name || null, lots: 1 });
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
      name: h.name || null,
      qty: h.qty,
      buyPrice: h.avgPrice,
      sellPrice: Number(sellPrice),
      ts: Date.now(),
      date: new Date().toISOString().slice(0, 10)
    });
  }
  p.holdings = p.holdings.filter((x) => x.id !== id);
  return write(p);
}

/**
 * Sell part (or all) of a position.
 *
 * The average buy price is deliberately left untouched: the cost basis of what remains
 * is what it always was, so selling half a winner must not flatter the rest of the row.
 * Selling the whole quantity removes the holding entirely.
 */
function sellHolding(id, { qty, price, fees = 0, ts, currency } = {}) {
  const p = read();
  const h = p.holdings.find((x) => x.id === id);
  if (!h) throw new Error('holding not found');

  const sellQty = Number(qty);
  const sellPrice = Number(price);
  if (!isFinite(sellQty) || sellQty <= 0) throw new Error('sell quantity must be > 0');
  if (!isFinite(sellPrice) || sellPrice < 0) throw new Error('sell price must be >= 0');
  // Floating-point quantities (0.1 + 0.2 crypto lots) must not block a full exit.
  if (sellQty - h.qty > 1e-9) throw new Error('cannot sell more than you hold');

  const charges = Number(fees) || 0;
  const when = Number(ts) || Date.now();
  p.trades.push({
    id: uid(),
    symbol: h.symbol,
    name: h.name || null,
    qty: sellQty,
    buyPrice: h.avgPrice,
    sellPrice,
    fees: charges,
    // Prices are in the currency the share is quoted in. Recording it is what lets a closed
    // dollar trade be reported in rupees later; without it the numbers would be read as base.
    currency: currency || null,
    ts: when,
    date: new Date(when).toISOString().slice(0, 10)
  });

  const left = h.qty - sellQty;
  if (left <= 1e-9) p.holdings = p.holdings.filter((x) => x.id !== id);
  else h.qty = left;

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

/**
 * What "today's move" is measured from.
 *
 * A position opened today never lived through the previous close, so charging it the whole
 * session's move is how a two-minute-old buy shows up as already down for the day. For those
 * the honest baseline is what was actually paid.
 */
function dayBaseline(holding, prevClose) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const openedToday = isFinite(holding.buyTs) && holding.buyTs >= midnight.getTime();
  return openedToday ? { price: holding.avgPrice, sinceBuy: true } : { price: prevClose, sinceBuy: false };
}

async function valuate() {
  const p = read();
  const base = p.baseCurrency || 'INR';
  const symbols = p.holdings.map((h) => h.symbol);

  const q = symbols.length ? await quotes(symbols) : {};
  // Closed trades carry their own currency, and the ticker may be long gone from the holdings.
  const currencies = [
    ...new Set([...Object.values(q).map((x) => x.currency), ...(p.trades || []).map((t) => t.currency)].filter(Boolean))
  ];
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
    const day = dayBaseline(h, prev);
    const dayPnl = h.qty * (price - day.price) * rate;
    const heldDays = h.buyTs ? Math.max(0, Math.round((Date.now() - h.buyTs) / 864e5)) : null;
    return {
      ...h,
      heldDays,
      name: (quote && quote.name) || h.name || h.symbol,
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
      dayFrom: day.price,
      dayPnlPct: day.price ? ((price - day.price) / day.price) * 100 : 0,
      openedToday: day.sinceBuy,
      series: (quote && quote.series) || [],
      live: !!quote
    };
  });

  const invested = rows.reduce((a, r) => a + r.invested, 0);
  const value = rows.reduce((a, r) => a + r.value, 0);
  const dayPnl = rows.reduce((a, r) => a + r.dayPnl, 0);
  const openedToday = rows.filter((r) => r.openedToday).length;
  const unrealised = value - invested;

  // Closed trades, newest first, each carrying the money it actually made.
  const trades = (p.trades || [])
    .map((t) => {
      // Trades recorded before currency was captured are read as already being in base.
      const rate = fx[t.currency] || 1;
      const cost = t.buyPrice * t.qty * rate;
      const proceeds = (t.sellPrice * t.qty - (t.fees || 0)) * rate;
      const pnl = proceeds - cost;
      return {
        ...t,
        ts: t.ts || (t.date ? Date.parse(t.date) : Date.now()),
        fxRate: rate,
        cost,
        proceeds,
        pnl,
        pnlPct: cost ? (pnl / cost) * 100 : 0
      };
    })
    .sort((a, b) => b.ts - a.ts);

  const realised = trades.reduce((a, t) => a + t.pnl, 0);
  const realisedCost = trades.reduce((a, t) => a + t.cost, 0);
  const tradeWins = trades.filter((t) => t.pnl > 0).length;

  rows.forEach((r) => (r.weight = value ? (r.value / value) * 100 : 0));
  rows.sort((a, b) => b.value - a.value);

  const winners = rows.filter((r) => r.pnl > 0).length;
  const sorted = [...rows].sort((a, b) => b.pnlPct - a.pnlPct);

  // "Money in" is every rupee ever committed — what is still held plus what has been closed —
  // so the headline return is measured against the whole journey, not just open positions.
  const totalCost = invested + realisedCost;
  const totalPnl = unrealised + realised;

  const totals = {
    baseCurrency: base,
    cash: p.cash || 0,
    invested,
    value,
    netWorth: value + (p.cash || 0),
    unrealised,
    unrealisedPct: invested ? (unrealised / invested) * 100 : 0,
    realised,
    realisedPct: realisedCost ? (realised / realisedCost) * 100 : 0,
    realisedCost,
    totalCost,
    totalPnl,
    totalPnlPct: totalCost ? (totalPnl / totalCost) * 100 : 0,
    dayPnl,
    dayPnlPct: value - dayPnl ? (dayPnl / (value - dayPnl)) * 100 : 0,
    // Rows bought today are measured from their buy price, so the headline needs to say so.
    openedToday,
    dayFromBuy: openedToday > 0 && openedToday === rows.length,
    positions: rows.length,
    winners,
    losers: rows.length - winners,
    tradeCount: trades.length,
    tradeWins,
    tradeLosses: trades.length - tradeWins,
    winRate: trades.length ? (tradeWins / trades.length) * 100 : null,
    bestTrade: trades.length ? trades.reduce((a, t) => (t.pnl > a.pnl ? t : a)) : null,
    worstTrade: trades.length ? trades.reduce((a, t) => (t.pnl < a.pnl ? t : a)) : null,
    best: sorted[0] || null,
    worst: sorted[sorted.length - 1] || null
  };

  const hist = pushSnapshot(Math.round(value), Math.round(unrealised));
  return { totals, rows, trades, history: hist };
}

module.exports = {
  init, read, replace, addHolding, updateHolding, removeHolding, sellHolding,
  setBase, setCash, valuate, history
};
