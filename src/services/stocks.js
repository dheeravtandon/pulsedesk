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

async function fxRate(from, to) {
  if (!from || !to || from === to) return 1;
  try {
    const c = await chart(`${from}${to}=X`, '5d', '1d');
    return c.price || 1;
  } catch {
    return 1;
  }
}

module.exports = { chart, quotes, trending, hyped, indices, fxRate, scoreHype, INDICES, UNIVERSE_US, UNIVERSE_IN };
