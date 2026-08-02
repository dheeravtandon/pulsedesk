/* PulseDesk service worker — makes the app installable and usable offline (last known shell). */

const CACHE = 'pulsedesk-shell-v2';
const SHELL = [
  './', './index.html', './styles.css', './web.css', './app.js', './web-bridge.js',
  './install.js', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Market data is never served from the shell cache — stale prices are worse than no prices.
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  /*
   * Network first, cache as the safety net.
   *
   * Cache-first made every release invisible until the browser happened to evict the old
   * shell — people kept seeing a version of the app that no longer existed. Offline still
   * works: the fetch fails, and the last good copy is served from the cache.
   */
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});
