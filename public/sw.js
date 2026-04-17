/* Hops & Finds — Service Worker
 * Strategy:
 *  - Static assets (shell): cache-first
 *  - API calls (/search, /beer): network-first with 10s timeout, fallback to cache
 *  - Everything else: network-first, no cache fallback
 */

const CACHE   = 'hf-v2';
const SHELL   = ['/', '/index.html', '/app.js', '/style.css', '/manifest.json'];
const API_TTL = 10 * 1000; // 10 s network timeout before falling back to cache

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin (Leaflet tiles handled separately), chrome-extension
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin &&
      !url.hostname.endsWith('tile.openstreetmap.org')) return;

  // OSM tiles — cache-first (tiles rarely change)
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // API routes — network-first with timeout, fallback to stale cache
  if (url.pathname.startsWith('/search') || url.pathname.startsWith('/beer')) {
    e.respondWith(networkFirst(request, API_TTL));
    return;
  }

  // Shell assets — cache-first
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return res;
      });
    })
  );
});

function networkFirst(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      const cached = await caches.match(request);
      if (cached) resolve(cached);
      else reject(new Error('Network timeout and no cache'));
    }, timeoutMs);

    fetch(request).then(async res => {
      clearTimeout(timer);
      if (res.ok) {
        const clone = res.clone();
        const cache = await caches.open(CACHE);
        cache.put(request, clone);
      }
      resolve(res);
    }).catch(async () => {
      clearTimeout(timer);
      const cached = await caches.match(request);
      if (cached) resolve(cached);
      else reject(new Error('Network error and no cache'));
    });
  });
}
