'use strict';

/**
 * Browser stand-in for the Electron preload bridge.
 *
 * app.js is shared verbatim between desktop and web, so this file has to expose the
 * exact same window.pulse surface — the difference is that data comes from the edge
 * worker instead of IPC, and the portfolio lives in localStorage instead of a JSON file.
 */

(function () {
  const API = (window.PULSE_API || '').replace(/\/+$/, '');
  const LS = {
    portfolio: 'pulse.portfolio',
    history: 'pulse.history',
    settings: 'pulse.settings',
    visitor: 'pulse.visitor'
  };

  const DEFAULT_PORTFOLIO = { baseCurrency: 'INR', cash: 0, holdings: [], trades: [] };
  const DEFAULT_SETTINGS = { compact: false, hyperMarket: 'both', alwaysOnTop: false, showOnAllDesktops: false, opacity: 1 };

  const read = (key, fallback) => {
    try {
      return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') };
    } catch {
      return { ...fallback };
    }
  };
  const write = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  async function api(path, opts) {
    const res = await fetch(`${API}${path}`, opts);
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return res.json();
  }

  /* ------------------------------- analytics ------------------------------- */

  function visitorId() {
    let v = localStorage.getItem(LS.visitor);
    if (!v) {
      v = (crypto.randomUUID ? crypto.randomUUID() : uid() + uid()).replace(/[^a-zA-Z0-9-]/g, '');
      localStorage.setItem(LS.visitor, v);
    }
    return v;
  }

  function platform() {
    const ua = navigator.userAgent;
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
      return /android/i.test(ua) ? 'android-pwa' : /iphone|ipad|ipod/i.test(ua) ? 'ios-pwa' : 'desktop-pwa';
    }
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    return 'web';
  }

  function beacon(kind) {
    if (!API) return;
    const body = JSON.stringify({ visitor: visitorId(), kind, platform: platform() });
    fetch(`${API}/api/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {});
  }

  /* ------------------------------- portfolio ------------------------------- */

  const portfolioStore = {
    read: () => read(LS.portfolio, DEFAULT_PORTFOLIO),
    write: (p) => write(LS.portfolio, p)
  };

  function pushSnapshot(value, pnl) {
    let hist = [];
    try {
      hist = JSON.parse(localStorage.getItem(LS.history) || '[]');
    } catch {
      hist = [];
    }
    const day = new Date().toISOString().slice(0, 10);
    const point = { date: day, ts: Date.now(), value, pnl };
    if (hist.length && hist[hist.length - 1].date === day) hist[hist.length - 1] = point;
    else hist.push(point);
    localStorage.setItem(LS.history, JSON.stringify(hist.slice(-400)));
    return hist.slice(-90);
  }

  async function valuate() {
    const p = portfolioStore.read();
    const base = p.baseCurrency || 'INR';
    const symbols = p.holdings.map((h) => h.symbol);

    let quotes = {};
    if (symbols.length) {
      quotes = await api(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`).catch(() => ({}));
    }

    const currencies = [...new Set(Object.values(quotes).map((q) => q && q.currency).filter(Boolean))];
    const fx = { [base]: 1 };
    await Promise.all(
      currencies.map(async (c) => {
        if (fx[c]) return;
        const r = await api(`/api/fx?from=${c}&to=${base}`).catch(() => ({ rate: 1 }));
        fx[c] = r.rate || 1;
      })
    );

    const rows = p.holdings.map((h) => {
      const q = quotes[h.symbol.toUpperCase()] || null;
      const cur = (q && q.currency) || base;
      const rate = fx[cur] || 1;
      const price = q ? q.price : h.avgPrice;
      const prev = q ? q.prevClose : h.avgPrice;
      const invested = h.qty * h.avgPrice * rate;
      const value = h.qty * price * rate;
      const pnl = value - invested;
      return {
        ...h,
        heldDays: h.buyTs ? Math.max(0, Math.round((Date.now() - h.buyTs) / 864e5)) : null,
        name: (q && q.name) || h.name || h.symbol,
        currency: cur,
        price,
        prevClose: prev,
        changePct: q ? q.changePct : 0,
        invested,
        value,
        pnl,
        pnlPct: invested ? (pnl / invested) * 100 : 0,
        dayPnl: h.qty * (price - prev) * rate,
        series: (q && q.series) || [],
        live: !!q
      };
    });

    const invested = rows.reduce((a, r) => a + r.invested, 0);
    const value = rows.reduce((a, r) => a + r.value, 0);
    const dayPnl = rows.reduce((a, r) => a + r.dayPnl, 0);
    const unrealised = value - invested;

    // Mirrors src/services/portfolio.js so web and desktop report identical numbers.
    const trades = (p.trades || [])
      .map((t) => {
        const cost = t.buyPrice * t.qty;
        const proceeds = t.sellPrice * t.qty - (t.fees || 0);
        const pnl = proceeds - cost;
        return {
          ...t,
          ts: t.ts || (t.date ? Date.parse(t.date) : Date.now()),
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

    const totalCost = invested + realisedCost;
    const totalPnl = unrealised + realised;

    return {
      totals: {
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
      },
      rows,
      trades,
      history: pushSnapshot(Math.round(value), Math.round(unrealised))
    };
  }

  /* -------------------------------- payload -------------------------------- */

  let payload = { meta: { errors: [] } };
  const listeners = new Set();

  function emit(patch) {
    payload = { ...payload, ...patch };
    listeners.forEach((cb) => cb(patch));
  }

  const errors = new Map();
  async function guard(name, fn) {
    try {
      const v = await fn();
      errors.delete(name);
      return v;
    } catch (err) {
      errors.set(name, err.message);
      return null;
    }
  }
  const meta = () => ({ errors: [...errors.entries()].map(([k, v]) => `${k}: ${v}`), updatedAt: Date.now() });

  async function refreshFast() {
    const [indices, cryptoData, pf] = await Promise.all([
      guard('indices', () => api('/api/indices')),
      guard('crypto', () => api('/api/crypto')),
      guard('portfolio', valuate)
    ]);
    const sessions = await guard('sessions', () => api('/api/sessions'));

    const pool = [...(indices || []), ...(payload.hyped || [])].filter((r) => r && isFinite(r.changePct));
    const up = pool.filter((r) => r.changePct > 0).length;
    const down = pool.filter((r) => r.changePct < 0).length;
    const ratio = down ? up / down : up;
    const avg = pool.length ? pool.reduce((a, r) => a + r.changePct, 0) / pool.length : 0;
    const vix = indices ? (indices.find((i) => i.label === 'VIX') || {}).price : undefined;
    const fng = cryptoData && cryptoData.fng;

    let score = (ratio - 1) * 20 + avg * 6;
    if (isFinite(vix)) score += vix < 14 ? 12 : vix < 20 ? 4 : vix < 28 ? -8 : -18;
    if (payload.news && payload.news.counts) score += (payload.news.counts.bullish - payload.news.counts.bearish) * 3;
    if (fng && isFinite(fng.value)) score += (fng.value - 50) * 0.25;
    score = Math.max(-100, Math.min(100, Math.round(score)));
    const mood = score >= 45 ? 'GREEDY' : score >= 15 ? 'BULLISH' : score > -15 ? 'NEUTRAL' : score > -45 ? 'BEARISH' : 'FEARFUL';

    emit({
      indices: indices || payload.indices || [],
      crypto: cryptoData || payload.crypto || { rows: [] },
      portfolio: pf || payload.portfolio || null,
      market: {
        sessions: (sessions && sessions.sessions) || (payload.market && payload.market.sessions) || [],
        breadth: { advancers: up, decliners: down, unchanged: pool.length - up - down, total: pool.length, avgChange: avg, ratio },
        pulse: { score, mood }
      },
      meta: meta()
    });
  }

  async function refreshMedium() {
    const s = read(LS.settings, DEFAULT_SETTINGS);
    const held = ((payload.portfolio && payload.portfolio.rows) || []).map((r) => r.symbol).join(',');
    const [feed, hyped, popular, funds] = await Promise.all([
      guard('news', () => api('/api/news')),
      guard('hyped', () => api(`/api/hyped?market=${s.hyperMarket || 'both'}${held ? `&symbols=${encodeURIComponent(held)}` : ''}`)),
      guard('popular', () => api('/api/popular')),
      guard('funds', () => api('/api/funds'))
    ]);
    emit({
      news: feed || payload.news || { items: [], counts: {} },
      hyped: hyped || payload.hyped || [],
      popular: popular || payload.popular || [],
      funds: funds || payload.funds || [],
      meta: meta()
    });
  }

  const refreshAll = () => Promise.all([refreshFast(), refreshMedium()]);

  /* --------------------------------- bridge -------------------------------- */

  window.pulse = {
    get: async () => payload,
    refresh: async () => {
      await refreshAll();
      return payload;
    },
    onUpdate: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    portfolio: {
      read: async () => portfolioStore.read(),
      add: async (h) => {
        const p = portfolioStore.read();
        const symbol = String(h.symbol || '').trim().toUpperCase();
        const qty = Number(h.qty);
        const avgPrice = Number(h.avgPrice);
        if (!symbol || !isFinite(qty) || qty <= 0 || !isFinite(avgPrice)) throw new Error('invalid holding');
        const buyTs = Number(h.buyTs) || Date.now();
        const buyDate = new Date(buyTs).toISOString().slice(0, 10);
        const existing = p.holdings.find((x) => x.symbol === symbol);
        if (existing) {
          const total = existing.qty + qty;
          existing.avgPrice = (existing.qty * existing.avgPrice + qty * avgPrice) / total;
          existing.qty = total;
          if (!existing.buyTs || buyTs < existing.buyTs) {
            existing.buyTs = buyTs;
            existing.buyDate = buyDate;
          }
        } else {
          p.holdings.push({ id: uid(), symbol, qty, avgPrice, buyTs, buyDate, name: h.name || null });
        }
        portfolioStore.write(p);
        const v = await valuate();
        emit({ portfolio: v });
        return v;
      },
      update: async (id, patch) => {
        const p = portfolioStore.read();
        const h = p.holdings.find((x) => x.id === id);
        if (!h) throw new Error('holding not found');
        if (patch.qty != null) h.qty = Number(patch.qty);
        if (patch.avgPrice != null) h.avgPrice = Number(patch.avgPrice);
        if (patch.symbol) h.symbol = String(patch.symbol).trim().toUpperCase();
        portfolioStore.write(p);
        const v = await valuate();
        emit({ portfolio: v });
        return v;
      },
      remove: async (id, sellPrice) => {
        const p = portfolioStore.read();
        const h = p.holdings.find((x) => x.id === id);
        if (h && sellPrice != null && isFinite(Number(sellPrice))) {
          p.trades.push({ id: uid(), symbol: h.symbol, qty: h.qty, buyPrice: h.avgPrice, sellPrice: Number(sellPrice), date: new Date().toISOString().slice(0, 10) });
        }
        p.holdings = p.holdings.filter((x) => x.id !== id);
        portfolioStore.write(p);
        const v = await valuate();
        emit({ portfolio: v });
        return v;
      },
      /** Mirrors sellHolding() in src/services/portfolio.js — average buy price is left alone. */
      sell: async (id, { qty, price, fees = 0, ts } = {}) => {
        const p = portfolioStore.read();
        const h = p.holdings.find((x) => x.id === id);
        if (!h) throw new Error('holding not found');

        const sellQty = Number(qty);
        const sellPrice = Number(price);
        if (!isFinite(sellQty) || sellQty <= 0) throw new Error('sell quantity must be > 0');
        if (!isFinite(sellPrice) || sellPrice < 0) throw new Error('sell price must be >= 0');
        if (sellQty - h.qty > 1e-9) throw new Error('cannot sell more than you hold');

        const when = Number(ts) || Date.now();
        p.trades.push({
          id: uid(),
          symbol: h.symbol,
          name: h.name || null,
          qty: sellQty,
          buyPrice: h.avgPrice,
          sellPrice,
          fees: Number(fees) || 0,
          ts: when,
          date: new Date(when).toISOString().slice(0, 10)
        });

        const left = h.qty - sellQty;
        if (left <= 1e-9) p.holdings = p.holdings.filter((x) => x.id !== id);
        else h.qty = left;

        portfolioStore.write(p);
        const v = await valuate();
        emit({ portfolio: v });
        return v;
      },
      setBase: async (c) => {
        const p = portfolioStore.read();
        p.baseCurrency = String(c || 'INR').toUpperCase();
        portfolioStore.write(p);
        const v = await valuate();
        emit({ portfolio: v });
        return v;
      },
      setCash: async (a) => {
        const p = portfolioStore.read();
        p.cash = Number(a) || 0;
        portfolioStore.write(p);
        const v = await valuate();
        emit({ portfolio: v });
        return v;
      },
      import: async (data) => {
        portfolioStore.write({ ...DEFAULT_PORTFOLIO, ...data });
        const v = await valuate();
        emit({ portfolio: v });
        return v;
      }
    },
    settings: {
      get: async () => read(LS.settings, DEFAULT_SETTINGS),
      set: async (patch) => {
        const s = write(LS.settings, { ...read(LS.settings, DEFAULT_SETTINGS), ...patch });
        if (patch.hyperMarket) refreshMedium();
        return s;
      }
    },
    win: {
      minimize: async () => {},
      hide: async () => {},
      quit: async () => {},
      toggleMaximize: () => window.pulse.win.toggleFullscreen(),
      toggleFullscreen: async () => {
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
            return false;
          }
          await document.documentElement.requestFullscreen();
          return true;
        } catch {
          return false;
        }
      },
      state: async () => ({ maximized: false, fullscreen: !!document.fullscreenElement })
    },
    openExternal: async (url) => {
      if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
    },
    lookup: async (symbol) => api(`/api/lookup?symbol=${encodeURIComponent(symbol)}`).catch((e) => ({ error: e.message })),
    search: async (query) => api(`/api/search?q=${encodeURIComponent(query)}`).catch(() => []),
    priceAt: async (symbol, ts) =>
      api(`/api/price-at?symbol=${encodeURIComponent(symbol)}&ts=${Math.round(Number(ts) / 60000) * 60000}`).catch((e) => ({ error: e.message })),
    history: async (symbol, range) =>
      api(`/api/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`).catch((e) => ({ error: e.message }))
  };

  /* --------------------------------- start --------------------------------- */

  if (!API) {
    console.warn('PULSE_API is not configured — set it in config.js');
  }

  beacon('open');
  setInterval(() => document.visibilityState === 'visible' && beacon('heartbeat'), 4 * 60 * 1000);

  refreshAll();
  setInterval(() => document.visibilityState === 'visible' && refreshFast(), 60 * 1000);
  setInterval(() => document.visibilityState === 'visible' && refreshMedium(), 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshFast());

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
