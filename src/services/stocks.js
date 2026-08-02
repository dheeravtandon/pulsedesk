'use strict';

const { getJSON, getText, cachedJSON, pool, settled } = require('./http');

const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

const INDICES = [
  { symbol: '^NSEI', label: 'NIFTY 50' },
  { symbol: '^BSESN', label: 'SENSEX' },
  { symbol: '^NSEBANK', label: 'BANK NIFTY' },
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'NASDAQ' },
  { symbol: '^DJI', label: 'DOW 30' },
  { symbol: '^VIX', label: 'VIX' },
  { symbol: 'GC=F', label: 'GOLD' },
  { symbol: 'SI=F', label: 'SILVER' },
  { symbol: 'CL=F', label: 'CRUDE' },
  { symbol: 'USDINR=X', label: 'USD/INR' },
  { symbol: 'BTC-USD', label: 'BTC' }
];

/** Liquid, news-heavy names used as the hype universe when Yahoo's trending feed is unavailable. */
const UNIVERSE_US = [
  'NVDA', 'TSLA', 'AAPL', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL', 'PLTR', 'COIN',
  'MSTR', 'SMCI', 'INTC', 'NFLX', 'AVGO', 'MU', 'BABA', 'SOFI', 'RIVN', 'LCID',
  'F', 'BA', 'DIS', 'UBER', 'ARM', 'CRWD', 'SNOW', 'RBLX', 'HOOD', 'GME'
];

const UNIVERSE_IN = [
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS', 'SBIN.NS',
  'TATAMOTORS.NS', 'ADANIENT.NS', 'ADANIPORTS.NS', 'ITC.NS', 'AXISBANK.NS',
  'BHARTIARTL.NS', 'LT.NS', 'HINDUNILVR.NS', 'MARUTI.NS', 'WIPRO.NS',
  'BAJFINANCE.NS', 'ZOMATO.NS', 'IRFC.NS', 'YESBANK.NS'
];

function pct(now, prev) {
  if (!isFinite(now) || !isFinite(prev) || prev === 0) return 0;
  return ((now - prev) / prev) * 100;
}

function normalizeChart(json, daily) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !r.meta) return null;
  const meta = r.meta;
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const closes = (q.close || []).filter((v) => typeof v === 'number' && isFinite(v));
  const volumes = (q.volume || []).filter((v) => typeof v === 'number' && isFinite(v));

  const price = meta.regularMarketPrice != null ? meta.regularMarketPrice : closes[closes.length - 1];
  // On daily+ intervals chartPreviousClose is the close before the whole range, so the
  // second-to-last candle is the only reliable "yesterday" reference.
  let prevClose = null;
  if (daily && closes.length > 1) prevClose = closes[closes.length - 2];
  if (prevClose == null && meta.previousClose != null) prevClose = meta.previousClose;
  if (prevClose == null && meta.chartPreviousClose != null) prevClose = meta.chartPreviousClose;
  if (prevClose == null && closes.length > 1) prevClose = closes[closes.length - 2];

  const dayVolume = meta.regularMarketVolume != null ? meta.regularMarketVolume : volumes[volumes.length - 1];
  // Only daily candles give a comparable session-volume baseline.
  const hist = daily ? volumes.slice(0, -1) : [];
  const avgVolume = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : dayVolume || 0;

  return {
    symbol: meta.symbol,
    name: meta.longName || meta.shortName || meta.symbol,
    exchange: meta.fullExchangeName || meta.exchangeName || '',
    currency: meta.currency || 'USD',
    price: price != null ? price : 0,
    prevClose: prevClose != null ? prevClose : price || 0,
    changePct: pct(price, prevClose),
    dayHigh: meta.regularMarketDayHigh,
    dayLow: meta.regularMarketDayLow,
    fiftyTwoHigh: meta.fiftyTwoWeekHigh,
    fiftyTwoLow: meta.fiftyTwoWeekLow,
    volume: dayVolume || 0,
    avgVolume: avgVolume || 0,
    volumeRatio: avgVolume ? (dayVolume || 0) / avgVolume : 1,
    series: closes.slice(-60),
    marketState: meta.marketState || ''
  };
}

async function chart(symbol, range = '1d', interval = '5m') {
  let lastErr;
  const daily = /^(1d|5d|1wk|1mo|3mo)$/.test(interval);
  for (const host of HOSTS) {
    const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
    try {
      const out = normalizeChart(await getJSON(url, { timeout: 10000 }), daily);
      if (out) return out;
    } catch (err) {
      lastErr = err;
    }
  }
  const fb = await settled(stooq(symbol));
  if (fb) return fb;
  throw lastErr || new Error(`no chart for ${symbol}`);
}

/** Free CSV fallback for US tickers when Yahoo throttles. */
async function stooq(symbol) {
  if (/[\^=]/.test(symbol) || symbol.includes('.')) return null;
  const csv = await getText(`https://stooq.com/q/l/?s=${symbol.toLowerCase()}.us&f=sd2t2ohlcvp&h&e=csv`, { timeout: 8000 });
  const [, row] = csv.trim().split(/\r?\n/);
  if (!row) return null;
  const [sym, , , open, , , close, volume] = row.split(',');
  const c = parseFloat(close);
  const o = parseFloat(open);
  if (!isFinite(c)) return null;
  return {
    symbol: (sym || symbol).toUpperCase().replace('.US', ''),
    name: symbol,
    exchange: 'US',
    currency: 'USD',
    price: c,
    prevClose: o,
    changePct: pct(c, o),
    volume: parseFloat(volume) || 0,
    avgVolume: parseFloat(volume) || 0,
    volumeRatio: 1,
    series: [o, c],
    marketState: ''
  };
}

/** Type-ahead over Yahoo's symbol directory — matches company names as well as tickers. */
async function search(query) {
  const q = String(query || '').trim();
  if (q.length < 1) return [];
  const KEEP = new Set(['EQUITY', 'ETF', 'INDEX', 'CRYPTOCURRENCY', 'CURRENCY', 'MUTUALFUND']);

  for (const host of HOSTS) {
    try {
      const j = await cachedJSON(
        `search:${q.toLowerCase()}`,
        `${host}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=14&newsCount=0&listsCount=0&enableFuzzyQuery=true`,
        5 * 60 * 1000
      );
      const rows = (j.quotes || [])
        .filter((r) => r.symbol && KEEP.has(r.quoteType))
        .map((r) => ({
          symbol: r.symbol,
          name: r.longname || r.shortname || r.symbol,
          exchange: r.exchDisp || r.exchange || '',
          type: r.quoteType === 'CRYPTOCURRENCY' ? 'CRYPTO' : r.quoteType === 'MUTUALFUND' ? 'FUND' : r.quoteType,
          region: /\.NS$/.test(r.symbol) ? 'NSE' : /\.BO$/.test(r.symbol) ? 'BSE' : r.exchDisp || ''
        }));
      // Indian listings first for an India-based user, then by how early the match appears.
      rows.sort((a, b) => (/\.(NS|BO)$/.test(b.symbol) ? 1 : 0) - (/\.(NS|BO)$/.test(a.symbol) ? 1 : 0));
      if (rows.length) return rows;
    } catch {
      /* try the next host */
    }
  }
  return [];
}

/** Price of a symbol at a past moment; falls back to the nearest candle that exists. */
async function priceAt(symbol, timestampMs) {
  const now = Date.now();
  const ts = Math.min(Number(timestampMs) || now, now);
  const ageDays = (now - ts) / 864e5;

  if (ageDays < 0.02) {
    const live = await chart(symbol, '1d', '5m');
    return { price: live.price, at: now, exact: true, currency: live.currency, name: live.name, granularity: 'live' };
  }

  // Widen the window step by step: a weekend, holiday or halt means the exact
  // moment has no candle, and the honest answer is the nearest one that does.
  const plans = [
    ageDays <= 55 ? { interval: '15m', pad: 4 * 3600 } : null,
    ageDays <= 55 ? { interval: '60m', pad: 36 * 3600 } : null,
    { interval: '1d', pad: 7 * 864e2 },
    { interval: '1d', pad: 30 * 864e2 },
    { interval: '1wk', pad: 120 * 864e2 }
  ].filter(Boolean);

  const sec = Math.floor(ts / 1000);

  for (const plan of plans) {
    for (const host of HOSTS) {
      try {
        const period1 = Math.max(0, sec - plan.pad);
        const period2 = Math.min(Math.floor(now / 1000), sec + plan.pad);
        const j = await getJSON(
          `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${plan.interval}`,
          { timeout: 12000 }
        );
        const r = j.chart && j.chart.result && j.chart.result[0];
        if (!r || !r.timestamp) continue;
        const closes = (r.indicators.quote[0] || {}).close || [];

        let best = null;
        r.timestamp.forEach((t, i) => {
          const c = closes[i];
          if (typeof c !== 'number' || !isFinite(c)) return;
          const d = Math.abs(t * 1000 - ts);
          if (!best || d < best.d) best = { d, price: c, at: t * 1000 };
        });
        if (best) {
          return {
            price: best.price,
            at: best.at,
            exact: best.d < 6 * 36e5,
            currency: r.meta.currency,
            name: r.meta.longName || r.meta.shortName || symbol,
            granularity: plan.interval
          };
        }
      } catch {
        /* try the next host, then the next plan */
      }
    }
  }

  // No candle was found anywhere near the requested time (often because the symbol's
  // history doesn't reach that far back) — the honest answer is today's price, but the
  // "at" timestamp must stay the requested one, not now, or the UI mislabels a 2010
  // purchase as having happened today.
  const daily = await chart(symbol, '2y', '1d');
  return { price: daily.price, at: ts, exact: false, currency: daily.currency, name: daily.name, granularity: 'fallback', noHistory: true };
}

/** Large, widely-held names with a volatility read so "stable" is measured, not asserted. */
const POPULAR = [
  { symbol: 'RELIANCE.NS', tag: 'India · Energy', sector: 'Energy' }, { symbol: 'ONGC.NS', tag: 'India · Energy', sector: 'Energy' },
  { symbol: 'TCS.NS', tag: 'India · IT', sector: 'Technology' }, { symbol: 'INFY.NS', tag: 'India · IT', sector: 'Technology' },
  { symbol: 'WIPRO.NS', tag: 'India · IT', sector: 'Technology' },
  { symbol: 'HDFCBANK.NS', tag: 'India · Bank', sector: 'Banking' }, { symbol: 'ICICIBANK.NS', tag: 'India · Bank', sector: 'Banking' },
  { symbol: 'SBIN.NS', tag: 'India · Bank', sector: 'Banking' },
  { symbol: 'ITC.NS', tag: 'India · FMCG', sector: 'FMCG' }, { symbol: 'HINDUNILVR.NS', tag: 'India · FMCG', sector: 'FMCG' },
  { symbol: 'LT.NS', tag: 'India · Infra', sector: 'Industrials' },
  { symbol: 'BHARTIARTL.NS', tag: 'India · Telecom', sector: 'Telecom' },
  { symbol: 'MARUTI.NS', tag: 'India · Auto', sector: 'Auto' }, { symbol: 'TATAMOTORS.NS', tag: 'India · Auto', sector: 'Auto' },
  { symbol: 'SUNPHARMA.NS', tag: 'India · Pharma', sector: 'Pharma' }, { symbol: 'DRREDDY.NS', tag: 'India · Pharma', sector: 'Pharma' },
  { symbol: 'TATASTEEL.NS', tag: 'India · Metals', sector: 'Metals' },
  { symbol: 'NTPC.NS', tag: 'India · Power', sector: 'Power' }, { symbol: 'POWERGRID.NS', tag: 'India · Power', sector: 'Power' },
  { symbol: 'AAPL', tag: 'US · Tech', sector: 'Technology' }, { symbol: 'MSFT', tag: 'US · Tech', sector: 'Technology' },
  { symbol: 'GOOGL', tag: 'US · Tech', sector: 'Technology' }, { symbol: 'AMZN', tag: 'US · Retail', sector: 'Retail' },
  { symbol: 'NVDA', tag: 'US · Semis', sector: 'Technology' }, { symbol: 'JNJ', tag: 'US · Pharma', sector: 'Pharma' },
  { symbol: 'KO', tag: 'US · Beverages', sector: 'FMCG' }, { symbol: 'JPM', tag: 'US · Bank', sector: 'Banking' },
  { symbol: 'V', tag: 'US · Payments', sector: 'Technology' }, { symbol: 'PG', tag: 'US · FMCG', sector: 'FMCG' },
  { symbol: 'XOM', tag: 'US · Energy', sector: 'Energy' }, { symbol: 'CVX', tag: 'US · Energy', sector: 'Energy' }
];

/** Google-Finance-style chart ranges: each maps to a Yahoo range+interval pair. */
const RANGE_MAP = {
  '1D': { range: '1d', interval: '5m' },
  '5D': { range: '5d', interval: '15m' },
  '1M': { range: '1mo', interval: '60m' },
  '6M': { range: '6mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' }
};

/** Full timestamp+price series for the stock detail chart modal. */
async function history(symbol, rangeKey = '1D') {
  const cfg = RANGE_MAP[rangeKey] || RANGE_MAP['1D'];
  let lastErr;
  for (const host of HOSTS) {
    try {
      const j = await getJSON(
        `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${cfg.range}&interval=${cfg.interval}&includePrePost=false`,
        { timeout: 12000 }
      );
      const r = j.chart && j.chart.result && j.chart.result[0];
      if (!r || !r.meta) continue;
      const ts = r.timestamp || [];
      const closes = ((r.indicators.quote[0] || {}).close) || [];
      const points = ts
        .map((t, i) => ({ t: t * 1000, c: closes[i] }))
        .filter((p) => typeof p.c === 'number' && isFinite(p.c));
      if (!points.length) continue;
      return {
        symbol: r.meta.symbol,
        name: r.meta.longName || r.meta.shortName || symbol,
        currency: r.meta.currency || 'USD',
        range: rangeKey,
        points
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`no history for ${symbol}`);
}

function annualVolatility(series) {
  if (!series || series.length < 20) return null;
  const rets = [];
  for (let i = 1; i < series.length; i++) {
    if (series[i - 1] > 0) rets.push(Math.log(series[i] / series[i - 1]));
  }
  if (rets.length < 15) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

async function popular() {
  const rows = await pool(POPULAR, 6, async (p) => {
    const j = await getJSON(
      `${HOSTS[0]}/v8/finance/chart/${encodeURIComponent(p.symbol)}?range=1y&interval=1d`,
      { timeout: 12000 }
    );
    const c = normalizeChart(j, true);
    if (!c) return null;
    const closes = ((j.chart.result[0].indicators.quote[0] || {}).close || []).filter((v) => typeof v === 'number' && isFinite(v));
    const first = closes[0];
    const vol = annualVolatility(closes);
    return {
      ...c,
      tag: p.tag,
      sector: p.sector,
      yearPct: first ? ((c.price - first) / first) * 100 : null,
      volatility: vol,
      // Below ~25% annualised is the practical dividing line between steady and jumpy.
      stability: vol == null ? 'unknown' : vol < 18 ? 'very steady' : vol < 25 ? 'steady' : vol < 40 ? 'moves a lot' : 'volatile'
    };
  });
  return rows.filter(Boolean).sort((a, b) => (a.volatility ?? 999) - (b.volatility ?? 999));
}

async function quotes(symbols, range = '1d', interval = '5m') {
  const list = [...new Set(symbols.filter(Boolean))];
  const rows = await pool(list, 6, (s) => chart(s, range, interval));
  const map = {};
  rows.forEach((r) => {
    if (r) map[r.symbol.toUpperCase()] = r;
  });
  // Yahoo can echo a resolved symbol; keep the requested key addressable too.
  list.forEach((s, i) => {
    if (rows[i] && !map[s.toUpperCase()]) map[s.toUpperCase()] = rows[i];
  });
  return map;
}

async function trending(region = 'US') {
  try {
    const j = await cachedJSON(
      `trend:${region}`,
      `${HOSTS[0]}/v1/finance/trending/${region}?count=25`,
      10 * 60 * 1000
    );
    const q = j && j.finance && j.finance.result && j.finance.result[0] && j.finance.result[0].quotes;
    return (q || []).map((x) => x.symbol).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Hype = unusual volume + move magnitude + news chatter.
 * Each component is min-max normalised across the candidate set so the score is comparable.
 */
function scoreHype(rows, mentions) {
  const clean = rows.filter((r) => r && r.price > 0);
  if (!clean.length) return [];
  const vals = {
    vol: clean.map((r) => Math.min(r.volumeRatio || 1, 8)),
    mov: clean.map((r) => Math.min(Math.abs(r.changePct || 0), 25)),
    news: clean.map((r) => mentions[r.symbol.toUpperCase()] || 0)
  };
  const norm = (arr) => {
    const lo = Math.min(...arr);
    const hi = Math.max(...arr);
    return (v) => (hi === lo ? 0.5 : (v - lo) / (hi - lo));
  };
  const nv = norm(vals.vol);
  const nm = norm(vals.mov);
  const nn = norm(vals.news);

  return clean
    .map((r) => {
      const m = mentions[r.symbol.toUpperCase()] || 0;
      const score =
        0.45 * nv(Math.min(r.volumeRatio || 1, 8)) +
        0.35 * nm(Math.min(Math.abs(r.changePct || 0), 25)) +
        0.2 * nn(m);
      return {
        ...r,
        newsMentions: m,
        hype: Math.round(score * 100),
        reason: [
          r.volumeRatio >= 1.5 ? `${r.volumeRatio.toFixed(1)}x volume` : null,
          Math.abs(r.changePct) >= 2 ? `${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(1)}% move` : null,
          m > 0 ? `${m} headline${m > 1 ? 's' : ''}` : null
        ]
          .filter(Boolean)
          .join(' · ') || 'steady flow'
      };
    })
    .sort((a, b) => b.hype - a.hype);
}

async function hyped(mentions = {}, extraSymbols = [], market = 'both') {
  const trend = await trending('US');
  const base = market === 'IN' ? UNIVERSE_IN : market === 'US' ? UNIVERSE_US : [...UNIVERSE_US, ...UNIVERSE_IN];
  const universe = [...new Set([...trend, ...base, ...extraSymbols, ...Object.keys(mentions)])]
    .filter((s) => !/[\^=]/.test(s))
    .slice(0, 70);

  const rows = await pool(universe, 8, (s) => chart(s, '1mo', '1d'));
  return scoreHype(rows, mentions);
}

async function indices() {
  const rows = await pool(INDICES, 6, async (i) => {
    const c = await chart(i.symbol, '5d', '1d');
    return { ...c, label: i.label };
  });
  return rows.filter(Boolean);
}

/**
 * Both directions of a pair are quoted to four significant figures, so the small-number side
 * loses precision: INRUSD=X reads 0.0105 where USDINR=X reads 95.39 — a 0.16% gap, which is
 * real money on a large order. When the direct rate is well under 1, invert the other side.
 */
async function fxRate(from, to) {
  if (!from || !to || from === to) return 1;
  const direct = await settled(chart(`${from}${to}=X`, '5d', '1d'));
  if (direct && direct.price >= 0.1) return direct.price;

  const inverse = await settled(chart(`${to}${from}=X`, '5d', '1d'));
  if (inverse && inverse.price > 0) return 1 / inverse.price;
  return direct && direct.price ? direct.price : 1;
}

module.exports = {
  chart, quotes, trending, hyped, indices, fxRate, scoreHype, search, priceAt, popular, history,
  INDICES, UNIVERSE_US, UNIVERSE_IN, POPULAR
};
