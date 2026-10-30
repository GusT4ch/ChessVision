// ChessVision service worker — cache-first offline shell, including the engine.
const CACHE = 'chessvision-v6';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/board.js',
  './js/engine.js',
  './js/chess.js',
  './engine/stockfish-nnue-16-single.js',
  './engine/stockfish-nnue-16-single.wasm',
  './engine/nn-5af11540bbfe.nnue',
  './icons/icon-192.png',
  ...['w','b'].flatMap((c) => ['P','N','B','R','Q','K'].map((p) => './pieces/' + c + p + '.svg')),
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  // App files: network-first so updates show up immediately; cache is the offline fallback.
  if (!request.url.includes('/engine/')) {
    e.respondWith(
      fetch(request).then((resp) => {
        if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
        return resp;
      }).catch(() => caches.match(request))
    );
    return;
  }
  // Engine files (large, never change): cache-first.
  e.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((resp) => {
        // runtime-cache same-origin successful responses
        if (resp.ok && new URL(request.url).origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return resp;
      }).catch(() => hit);
    })
  );
});
