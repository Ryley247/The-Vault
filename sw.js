const CACHE_NAME = 'vault-cache-v11';
const CORE_ASSETS = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];
// Libraries the app loads from a CDN. Cached up front so the ledger chart and
// drag-to-reorder still work offline after a single visit.
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache each file on its own: cache.addAll() is all-or-nothing, so one missing
    // file (say an icon) used to leave the whole app uncached without any warning.
    await Promise.allSettled([
      ...CORE_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
      ...CDN_ASSETS.map((url) => fetch(url).then((res) => (res.ok ? cache.put(url, res) : null)))
    ]);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Pages: network-first so updates show up right away, with the cached copy as the offline fallback.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        }
        // The server answered with an error page: keep showing the last good copy instead of caching or showing it.
        const good = await caches.match(req, { ignoreSearch: true }) || await caches.match('./index.html');
        return good || res;
      } catch (err) {
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Everything else: cache-first, and only remember good responses (opaque cross-origin ones can't be inspected).
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => cached))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
