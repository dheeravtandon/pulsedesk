'use strict';

const { getText, pool } = require('./http');
const { analyze } = require('./sentiment');

/**
 * Every source is a plain RSS/Atom feed — no keys, no quotas. The list is deliberately
 * long and overlapping: any one publisher can 404 or rate-limit without emptying the wire,
 * and de-duplication by normalised headline collapses the same story filed by five outlets.
 */
const FEEDS = [
  // US / global markets
  { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance', region: 'US' },
  { url: 'https://finance.yahoo.com/news/rss', source: 'Yahoo Markets', region: 'US' },
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch', region: 'US' },
  { url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', source: 'WSJ Markets', region: 'US' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC Markets', region: 'US' },
  { url: 'https://www.ft.com/markets?format=rss', source: 'FT Markets', region: 'GLOBAL' },
  { url: 'https://seekingalpha.com/market_currents.xml', source: 'Seeking Alpha', region: 'US' },
  { url: 'https://www.investing.com/rss/news_25.rss', source: 'Investing.com', region: 'GLOBAL' },
  { url: 'https://www.investing.com/rss/news_301.rss', source: 'Investing Econ', region: 'GLOBAL' },

  // India
  { url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', source: 'ET Markets', region: 'IN' },
  { url: 'https://economictimes.indiatimes.com/prime/technology-and-startups/rssfeeds/63319172.cms', source: 'ET Tech', region: 'IN' },
  { url: 'https://www.moneycontrol.com/rss/buzzingstocks.xml', source: 'Moneycontrol', region: 'IN' },
  { url: 'https://www.moneycontrol.com/rss/business.xml', source: 'MC Business', region: 'IN' },
  { url: 'https://www.moneycontrol.com/rss/marketreports.xml', source: 'MC Reports', region: 'IN' },
  { url: 'https://www.livemint.com/rss/markets', source: 'Mint Markets', region: 'IN' },
  { url: 'https://www.livemint.com/rss/companies', source: 'Mint Companies', region: 'IN' },
  { url: 'https://www.business-standard.com/rss/markets-106.rss', source: 'Business Standard', region: 'IN' },
  { url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss', source: 'BusinessLine', region: 'IN' },

  // Crypto
  { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph', region: 'CRYPTO' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk', region: 'CRYPTO' },

  // Broad sweeps — catch anything the dedicated feeds miss
  { url: 'https://news.google.com/rss/search?q=nifty+OR+sensex+when:1d&hl=en-IN&gl=IN&ceid=IN:en', source: 'Google News IN', region: 'IN' },
  { url: 'https://news.google.com/rss/search?q=stock+market+when:1d&hl=en-US&gl=US&ceid=US:en', source: 'Google News US', region: 'US' }
];

/** Names the ticker extractor looks for in headline text. */
const TICKER_MAP = {
  NVDA: ['nvidia'], TSLA: ['tesla', 'musk'], AAPL: ['apple', 'iphone'], AMD: ['amd '],
  MSFT: ['microsoft'], AMZN: ['amazon'], META: ['meta platforms', 'facebook', 'instagram'],
  GOOGL: ['google', 'alphabet'], NFLX: ['netflix'], INTC: ['intel'], MU: ['micron'],
  COIN: ['coinbase'], MSTR: ['microstrategy', 'strategy inc'], PLTR: ['palantir'],
  SMCI: ['super micro'], BA: ['boeing'], DIS: ['disney'], UBER: ['uber'], ARM: ['arm holdings'],
  BABA: ['alibaba'], HOOD: ['robinhood'], GME: ['gamestop'], AVGO: ['broadcom'], CRWD: ['crowdstrike'],
  'RELIANCE.NS': ['reliance industries', 'ril '], 'TCS.NS': ['tcs', 'tata consultancy'],
  'INFY.NS': ['infosys'], 'HDFCBANK.NS': ['hdfc bank'], 'ICICIBANK.NS': ['icici bank'],
  'SBIN.NS': ['sbi', 'state bank'], 'TATAMOTORS.NS': ['tata motors'], 'ADANIENT.NS': ['adani enterprises', 'adani group'],
  'ITC.NS': ['itc '], 'AXISBANK.NS': ['axis bank'], 'BHARTIARTL.NS': ['bharti airtel', 'airtel'],
  'LT.NS': ['larsen', 'l&t'], 'MARUTI.NS': ['maruti'], 'WIPRO.NS': ['wipro'],
  'ZOMATO.NS': ['zomato', 'eternal ltd'], 'YESBANK.NS': ['yes bank'], 'BAJFINANCE.NS': ['bajaj finance'],
  'HINDUNILVR.NS': ['hindustan unilever', 'hul ']
};

const entities = (s) =>
  s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

// Feeds are frequently double-encoded (&amp;#39;), so entity decoding runs twice; some
// publishers also ship entities with the ampersand already stripped (day#39;s).
const decode = (s) =>
  entities(entities(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')))
    .replace(/<[^>]+>/g, '')
    .replace(/(^|[^&\s])#(\d{2,5});/g, (_, p, d) => p + String.fromCharCode(+d))
    .replace(/\s+/g, ' ')
    .trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};

function parseFeed(xml, source, region) {
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) || [];
  return blocks.map((b) => {
    let link = tag(b, 'link');
    if (!link) {
      const m = b.match(/<link[^>]*href="([^"]+)"/i);
      link = m ? m[1] : '';
    }
    const published = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const ts = published ? Date.parse(published) : NaN;
    return {
      title: tag(b, 'title'),
      link,
      summary: tag(b, 'description') || tag(b, 'summary'),
      source,
      region,
      ts: isFinite(ts) ? ts : Date.now()
    };
  });
}

function tickersIn(text) {
  const t = ` ${text.toLowerCase()} `;
  const found = new Set();
  for (const [sym, names] of Object.entries(TICKER_MAP)) {
    if (names.some((n) => t.includes(n))) found.add(sym);
  }
  const cashtags = text.match(/\$[A-Z]{2,5}\b/g) || [];
  cashtags.forEach((c) => found.add(c.slice(1)));
  return [...found];
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 9).join(' ');

async function fetchAll(limit = 40) {
  const results = await pool(FEEDS, 8, async (f) => parseFeed(await getText(f.url, { timeout: 11000 }), f.source, f.region));

  const seen = new Set();
  const items = [];
  for (const list of results) {
    for (const it of list || []) {
      if (!it.title || it.title.length < 12) continue;
      const key = norm(it.title);
      if (seen.has(key)) continue;
      seen.add(key);
      const sent = analyze(`${it.title}. ${it.summary}`);
      items.push({
        ...it,
        summary: it.summary.slice(0, 220),
        tickers: tickersIn(`${it.title} ${it.summary}`),
        ...sent
      });
    }
  }

  const now = Date.now();
  items.forEach((i) => {
    const ageH = Math.max(0, (now - i.ts) / 3.6e6);
    // Directional, recent and ticker-anchored headlines float to the top.
    i.rank =
      Math.abs(i.score) * 2 + i.tickers.length * 1.2 + Math.max(0, 6 - ageH) * 0.6 + (i.direction !== 'FLAT' ? 1.5 : 0);
  });

  const ranked = items.sort((a, b) => b.rank - a.rank);
  const top = ranked.slice(0, limit);

  const mentions = {};
  ranked.slice(0, 80).forEach((i) => i.tickers.forEach((t) => (mentions[t] = (mentions[t] || 0) + 1)));

  const bull = top.filter((i) => i.direction === 'RISE').length;
  const bear = top.filter((i) => i.direction === 'FALL').length;

  return {
    items: top,
    mentions,
    counts: { bullish: bull, bearish: bear, neutral: top.length - bull - bear, scanned: items.length },
    updatedAt: now
  };
}

module.exports = { fetchAll, TICKER_MAP };
