/* QuickAid service worker.
   Bump CACHE_VERSION on releases that change this file's asset list; old caches are deleted on activate. */
const CACHE_VERSION = 'quickaid-v1';

// App shell + all bundled data (hospitals, pharmacies, clinics, first aid live in these JS files).
const LOCAL_ASSETS = [
  './', 'index.html', 'style.css', 'app.js', 'data.js', 'aswan-data.js', 'pwa.js',
  'logo.png', 'manifest.json', 'offline.html',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];
// Pinned CDN files used by index.html.
const ICONS_CSS = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  ICONS_CSS,
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js'
];
const NETWORK_TIMEOUT_MS = 4000;

const scopeUrl = (p) => new URL(p, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Core local files: all required, so a broken install never goes live.
    await cache.addAll(LOCAL_ASSETS.map(scopeUrl));
    // CDN files: best effort (runtime caching will pick up anything missed).
    await Promise.allSettled(CDN_ASSETS.map((u) => cache.add(new Request(u, { mode: 'cors' }))));
    // Bootstrap Icons font files referenced from its CSS.
    try {
      const css = await (await cache.match(ICONS_CSS)).text();
      const fonts = [...css.matchAll(/url\(["']?([^"')]+\.woff2?[^"')]*)["']?\)/g)]
        .map((m) => new URL(m[1], ICONS_CSS).href);
      await Promise.allSettled([...new Set(fonts)].map((u) => cache.add(new Request(u, { mode: 'cors' }))));
    } catch (e) { /* ignore */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('quickaid-') && k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Network first (so deployments show up immediately), falling back to cache after a timeout/failure.
async function networkFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  const net = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  });
  net.catch(() => {});
  const cached = await cache.match(req, { ignoreSearch: true });
  if (!cached) return net;
  return Promise.race([
    net.catch(() => cached),
    new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS))
  ]);
}

// Cache first for versioned/pinned third-party assets.
async function cacheFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req).catch(async () => {
      const cache = await caches.open(CACHE_VERSION);
      return (await cache.match(scopeUrl('index.html'))) ||
             (await cache.match(scopeUrl('./'))) ||
             (await cache.match(scopeUrl('offline.html'))) ||
             new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req).catch(() => new Response('', { status: 503, statusText: 'Offline' })));
    return;
  }

  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(req).catch(() => new Response('', { status: 503, statusText: 'Offline' })));
  }
  // Everything else (e.g. Google Maps) goes straight to the network.
});
