'use strict';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const cache = new Map();

async function raw(url, { timeout = 12000, headers = {}, accept = 'application/json' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9', ...headers }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 90)}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getJSON(url, opts = {}) {
  const text = await raw(url, opts);
  return JSON.parse(text);
}

async function getText(url, opts = {}) {
  return raw(url, { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', ...opts });
}

/** getJSON with an in-memory TTL cache; stale value is served if the network fails. */
async function cachedJSON(key, url, ttlMs, opts = {}) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.value;
  try {
    const value = await getJSON(url, opts);
    cache.set(key, { at: now, value });
    return value;
  } catch (err) {
    if (hit) return hit.value;
    throw err;
  }
}

/** Run tasks with bounded concurrency; rejected tasks resolve to null. */
async function pool(items, limit, worker) {
  const out = new Array(items.length).fill(null);
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await worker(items[idx], idx);
      } catch {
        out[idx] = null;
      }
    }
  });
  await Promise.all(runners);
  return out;
}

const settled = async (promise, fallback = null) => {
  try {
    return await promise;
  } catch {
    return fallback;
  }
};

module.exports = { getJSON, getText, cachedJSON, pool, settled };
