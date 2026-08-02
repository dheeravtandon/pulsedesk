'use strict';

const { getJSON, cachedJSON, pool, settled } = require('./http');

const BINANCE = 'https://api.binance.com/api/v3';
const CG = 'https://api.coingecko.com/api/v3';

const EXCLUDE = /(UP|DOWN|BULL|BEAR)USDT$/;
// Pegged assets never "pump" — they only add noise to both lists.
const STABLE = /^(USDC|USD1|USDE|USDD|USDP|USDS|USDF|USDY|FDUSD|TUSD|BUSD|BFUSD|DAI|RLUSD|PYUSD|EURI|EURT|AEUR|XAUT|PAXG)USDT$/;

const NAMES = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', BNB: 'BNB', DOGE: 'Dogecoin',
  ADA: 'Cardano', AVAX: 'Avalanche', LINK: 'Chainlink', DOT: 'Polkadot', MATIC: 'Polygon',
  SHIB: 'Shiba Inu', LTC: 'Litecoin', TRX: 'TRON', NEAR: 'NEAR', SUI: 'Sui', APT: 'Aptos',
  PEPE: 'Pepe', WIF: 'dogwifhat', ARB: 'Arbitrum', OP: 'Optimism', INJ: 'Injective',
  TIA: 'Celestia', SEI: 'Sei', RNDR: 'Render', FET: 'Artificial Superintelligence', TON: 'Toncoin'
};

const label = (base) => NAMES[base] || base;

/** One 24h ticker pull feeds both the pump ranking and the most-traded list. */
async function tickers24h() {
  return cachedJSON('binance:24h', `${BINANCE}/ticker/24hr`, 45000, { timeout: 15000 });
}

const tradable = (all) =>
  all.filter((t) => t.symbol.endsWith('USDT') && !EXCLUDE.test(t.symbol) && !STABLE.test(t.symbol));

/** The pairs people are actually putting money through right now, by 24h turnover. */
async function mostTraded(limit = 10) {
  try {
    const all = await tickers24h();
    return tradable(all)
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, limit)
      .map((t) => {
        const base = t.symbol.replace(/USDT$/, '');
        return {
          symbol: base,
          name: label(base),
          pair: t.symbol,
          price: parseFloat(t.lastPrice),
          change24h: parseFloat(t.priceChangePercent) || 0,
          volume24hUsd: parseFloat(t.quoteVolume) || 0,
          trades24h: t.count || 0,
          source: 'Binance'
        };
      });
  } catch {
    const j = await settled(
      cachedJSON('cg:markets', `${CG}/coins/markets?vs_currency=usd&order=volume_desc&per_page=120&page=1&price_change_percentage=1h,24h`, 120000),
      []
    );
    return (j || []).slice(0, limit).map((c) => ({
      symbol: (c.symbol || '').toUpperCase(),
      name: c.name,
      pair: `${(c.symbol || '').toUpperCase()}USD`,
      price: c.current_price,
      change24h: c.price_change_percentage_24h_in_currency || 0,
      volume24hUsd: c.total_volume || 0,
      trades24h: 0,
      source: 'CoinGecko'
    }));
  }
}

/** Rolling 5-hour movers from Binance (exact 5h window), with a CoinGecko 1h/24h fallback. */
async function pumped(limit = 10, windowSize = '5h') {
  try {
    const all = await tickers24h();
    const liquid = tradable(all)
      .filter((t) => parseFloat(t.quoteVolume) > 3_000_000)
      .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
      .slice(0, 80);

    const chunks = [];
    for (let i = 0; i < liquid.length; i += 40) chunks.push(liquid.slice(i, i + 40).map((t) => t.symbol));

    const windows = await pool(chunks, 2, async (syms) => {
      const url = `${BINANCE}/ticker?symbols=${encodeURIComponent(JSON.stringify(syms))}&windowSize=${windowSize}`;
      return getJSON(url, { timeout: 15000 });
    });

    const byDay = Object.fromEntries(liquid.map((t) => [t.symbol, t]));
    const rows = windows
      .filter(Boolean)
      .flat()
      .map((w) => {
        const base = w.symbol.replace(/USDT$/, '');
        const d = byDay[w.symbol] || {};
        const open = parseFloat(w.openPrice);
        const last = parseFloat(w.lastPrice);
        return {
          symbol: base,
          name: label(base),
          pair: w.symbol,
          price: last,
          change5h: open ? ((last - open) / open) * 100 : 0,
          change24h: parseFloat(d.priceChangePercent) || 0,
          high5h: parseFloat(w.highPrice),
          low5h: parseFloat(w.lowPrice),
          volume5hUsd: parseFloat(w.quoteVolume) || 0,
          volume24hUsd: parseFloat(d.quoteVolume) || 0,
          trades5h: w.count || 0,
          source: 'Binance',
          window: windowSize
        };
      })
      .filter((r) => isFinite(r.price) && r.price > 0)
      .sort((a, b) => b.change5h - a.change5h)
      .slice(0, limit);

    if (rows.length) return rows;
  } catch {
    /* fall through to CoinGecko */
  }
  return pumpedFallback(limit);
}

async function pumpedFallback(limit) {
  const j = await settled(
    cachedJSON(
      'cg:markets',
      `${CG}/coins/markets?vs_currency=usd&order=volume_desc&per_page=120&page=1&price_change_percentage=1h,24h`,
      120000
    ),
    null
  );
  if (!j) return [];
  return (j || [])
    .map((c) => ({
      symbol: (c.symbol || '').toUpperCase(),
      name: c.name,
      pair: `${(c.symbol || '').toUpperCase()}USD`,
      price: c.current_price,
      change5h: c.price_change_percentage_1h_in_currency || 0,
      change24h: c.price_change_percentage_24h_in_currency || 0,
      high5h: c.high_24h,
      low5h: c.low_24h,
      volume5hUsd: (c.total_volume || 0) / 4.8,
      volume24hUsd: c.total_volume || 0,
      trades5h: 0,
      source: 'CoinGecko',
      window: '1h'
    }))
    .sort((a, b) => b.change5h - a.change5h)
    .slice(0, limit);
}

async function fearGreed() {
  const j = await settled(cachedJSON('fng', 'https://api.alternative.me/fng/?limit=2', 15 * 60 * 1000));
  const d = j && j.data && j.data[0];
  if (!d) return null;
  return {
    value: parseInt(d.value, 10),
    label: d.value_classification,
    prev: j.data[1] ? parseInt(j.data[1].value, 10) : null
  };
}

async function globalStats() {
  const j = await settled(cachedJSON('cg:global', `${CG}/global`, 10 * 60 * 1000));
  const d = j && j.data;
  if (!d) return null;
  return {
    marketCapUsd: d.total_market_cap && d.total_market_cap.usd,
    volumeUsd: d.total_volume && d.total_volume.usd,
    btcDominance: d.market_cap_percentage && d.market_cap_percentage.btc,
    capChange24h: d.market_cap_change_percentage_24h_usd
  };
}

module.exports = { pumped, mostTraded, fearGreed, globalStats };
