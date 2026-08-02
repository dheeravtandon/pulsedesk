/**
 * PulseDesk edge worker.
 *
 * Two jobs:
 *   1. Market data relay — browsers cannot call Yahoo/Binance/RSS directly (no CORS headers),
 *      so the same service modules the desktop app uses run here and answer with CORS enabled.
 *   2. Anonymous usage counter — a random per-browser id, no account, no IP stored, no cookies.
 */

import stocks from '../../src/services/stocks.js';
import news from '../../src/services/news.js';
import crypto from '../../src/services/crypto.js';
import market from '../../src/services/market.js';
import mutualfunds from '../../src/services/mutualfunds.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

const json = (body, ttl = 0, extra = {}) =>
  new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': ttl ? `public, max-age=${ttl}` : 'no-store',
      ...CORS,
      ...extra
    }
  });

const fail = (message, status = 500) => json({ error: message }, 0, { 'X-Error': '1' });

/** Edge-cache a computed payload so thousands of users cost one upstream call per TTL. */
async function cached(request, ctx, ttl, produce) {
  const cache = caches.default;
  const key = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  const body = await produce();
  const res = json(body, ttl);
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/* ------------------------------ usage counter ------------------------------ */

const DAY = () => new Date().toISOString().slice(0, 10);

async function ensureSchema(db) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS events (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         visitor TEXT NOT NULL,
         day TEXT NOT NULL,
         ts INTEGER NOT NULL,
         kind TEXT NOT NULL,
         platform TEXT,
         country TEXT
       )`
    ),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_events_day ON events (day)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_events_visitor ON events (visitor)')
  ]);
}

/** Visitor ids are client-generated random strings — never an IP, never an account. */
const cleanId = (v) => String(v || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);

async function ping(request, env, ctx) {
  if (!env.DB) return json({ ok: false, reason: 'no database bound' });
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* empty beacon is still a valid open */
  }
  const visitor = cleanId(body.visitor);
  if (!visitor) return json({ ok: false, reason: 'visitor id required' });

  const kind = body.kind === 'heartbeat' ? 'heartbeat' : 'open';
  const platform = String(body.platform || 'unknown').slice(0, 24);
  const country = (request.cf && request.cf.country) || 'XX';

  await ensureSchema(env.DB);
  await env.DB.prepare('INSERT INTO events (visitor, day, ts, kind, platform, country) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(visitor, DAY(), Date.now(), kind, platform, country)
    .run();

  // Opportunistic 90-day trim keeps the free tier comfortable.
  ctx.waitUntil(env.DB.prepare('DELETE FROM events WHERE ts < ?').bind(Date.now() - 90 * 864e5).run());
  return json({ ok: true });
}

async function stats(request, env) {
  if (!env.DB) return fail('no database bound', 503);
  const url = new URL(request.url);
  if (env.STATS_KEY && url.searchParams.get('key') !== env.STATS_KEY) return fail('unauthorised', 401);

  await ensureSchema(env.DB);
  const today = DAY();
  const now = Date.now();
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).first();

  const [onlineNow, todayOpens, todayPeople, totalPeople, totalOpens, weekPeople] = await Promise.all([
    q('SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE ts > ?', now - 5 * 60000),
    q("SELECT COUNT(*) AS n FROM events WHERE day = ? AND kind = 'open'", today),
    q('SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE day = ?', today),
    q('SELECT COUNT(DISTINCT visitor) AS n FROM events'),
    q("SELECT COUNT(*) AS n FROM events WHERE kind = 'open'"),
    q('SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE ts > ?', now - 7 * 864e5)
  ]);

  const daily = await env.DB.prepare(
    `SELECT day,
            COUNT(DISTINCT visitor) AS people,
            SUM(CASE WHEN kind = 'open' THEN 1 ELSE 0 END) AS opens
     FROM events GROUP BY day ORDER BY day DESC LIMIT 30`
  ).all();

  const countries = await env.DB.prepare(
    'SELECT country, COUNT(DISTINCT visitor) AS people FROM events GROUP BY country ORDER BY people DESC LIMIT 10'
  ).all();

  const platforms = await env.DB.prepare(
    'SELECT platform, COUNT(DISTINCT visitor) AS people FROM events GROUP BY platform ORDER BY people DESC'
  ).all();

  return json({
    onlineNow: onlineNow.n,
    todayOpens: todayOpens.n,
    todayPeople: todayPeople.n,
    weekPeople: weekPeople.n,
    totalPeople: totalPeople.n,
    totalOpens: totalOpens.n,
    daily: (daily.results || []).reverse(),
    countries: countries.results || [],
    platforms: platforms.results || [],
    generatedAt: now
  });
}

/* --------------------------------- routes --------------------------------- */

const num = (v, d) => {
  const n = parseFloat(v);
  return isFinite(n) ? n : d;
};

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const qp = url.searchParams;

  switch (p) {
    case '/':
    case '/api':
      return json({
        name: 'PulseDesk API',
        author: 'Dheerav Tandon',
        endpoints: ['/api/indices', '/api/news', '/api/hyped', '/api/popular', '/api/funds', '/api/crypto', '/api/sessions', '/api/quotes', '/api/fx', '/api/lookup', '/api/search', '/api/price-at', '/api/history', '/api/ping', '/api/stats', '/api/health']
      });

    case '/api/indices':
      return cached(request, ctx, 60, () => stocks.indices());

    case '/api/news':
      return cached(request, ctx, 300, () => news.fetchAll(40));

    case '/api/hyped':
      return cached(request, ctx, 300, async () => {
        const feed = await news.fetchAll(40).catch(() => ({ mentions: {} }));
        const extra = (qp.get('symbols') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30);
        const rows = await stocks.hyped(feed.mentions || {}, extra, qp.get('market') || 'both');
        return rows.slice(0, 24);
      });

    case '/api/crypto':
      return cached(request, ctx, 60, async () => {
        const [rows, traded, fng, global] = await Promise.all([
          crypto.pumped(10),
          crypto.mostTraded(10).catch(() => []),
          crypto.fearGreed().catch(() => null),
          crypto.globalStats().catch(() => null)
        ]);
        return { rows, traded, fng, global };
      });

    case '/api/popular':
      return cached(request, ctx, 900, () => stocks.popular());

    case '/api/funds':
      return cached(request, ctx, 1800, () => mutualfunds.popular());

    case '/api/search': {
      const q = (qp.get('q') || '').trim();
      if (q.length < 1) return json([], 60);
      return cached(request, ctx, 300, () => stocks.search(q));
    }

    case '/api/price-at': {
      const symbol = (qp.get('symbol') || '').trim();
      const ts = parseInt(qp.get('ts'), 10);
      if (!symbol) return fail('symbol required', 400);
      // Bucket to the minute so repeated lookups of the same moment share a cache entry.
      return cached(request, ctx, 600, () => stocks.priceAt(symbol, isFinite(ts) ? ts : Date.now()));
    }

    case '/api/history': {
      const symbol = (qp.get('symbol') || '').trim();
      const range = (qp.get('range') || '1D').trim();
      if (!symbol) return fail('symbol required', 400);
      const ttl = range === '1D' ? 60 : range === '5D' ? 300 : 1800;
      return cached(request, ctx, ttl, () => stocks.history(symbol, range));
    }

    case '/api/sessions': {
      const sessions = market.sessions();
      return json({ sessions }, 30);
    }

    case '/api/quotes': {
      const symbols = (qp.get('symbols') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40);
      if (!symbols.length) return json({});
      return cached(request, ctx, 60, () => stocks.quotes(symbols));
    }

    case '/api/fx':
      return cached(request, ctx, 600, async () => ({
        rate: await stocks.fxRate((qp.get('from') || 'USD').toUpperCase(), (qp.get('to') || 'INR').toUpperCase())
      }));

    case '/api/lookup': {
      const symbol = (qp.get('symbol') || '').trim();
      if (!symbol) return fail('symbol required', 400);
      return cached(request, ctx, 300, () => stocks.chart(symbol, '1mo', '1d').catch((e) => ({ error: e.message })));
    }

    case '/api/ping':
      return request.method === 'POST' ? ping(request, env, ctx) : fail('POST only', 405);

    case '/api/stats':
      return stats(request, env);

    case '/api/health': {
      const probe = async (name, fn) => {
        const t = Date.now();
        try {
          await fn();
          return { name, ok: true, ms: Date.now() - t };
        } catch (e) {
          return { name, ok: false, ms: Date.now() - t, error: e.message };
        }
      };
      const checks = await Promise.all([
        probe('yahoo', () => stocks.chart('AAPL', '5d', '1d')),
        probe('binance', () => crypto.pumped(3)),
        probe('news', () => news.fetchAll(3)),
        probe('funds', () => mutualfunds.popular())
      ]);
      return json({ checks, database: !!env.DB });
    }

    default:
      return fail('not found', 404);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    try {
      return await route(request, env, ctx);
    } catch (err) {
      return fail(err.message || 'worker error');
    }
  }
};
