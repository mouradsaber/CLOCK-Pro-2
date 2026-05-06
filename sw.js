// Clock Pro — Service Worker v1.0
// Strategy: Cache-first for app shell, network-first for fonts

const CACHE_NAME = 'clock-pro-v3';
const FONT_CACHE = 'clock-pro-fonts-v1';

// App shell — everything needed to run offline
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
];

// ── INSTALL ────────────────────────────────────────────────────────────
// Pre-cache the app shell on first install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())   // activate immediately
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────────────
// Clean up old caches from previous versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())   // take control of all pages
  );
});

// ── FETCH ──────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google Fonts — cache-first (they never change)
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // App shell — cache-first, fall back to network
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Cache successful responses
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Offline fallback
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
    );
  }
});

// ── BACKGROUND SYNC (alarm wake) ──────────────────────────────────────
// Attempt to keep alarms firing even when screen sleeps
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'KEEP_ALIVE') {
    // Acknowledge ping to prevent SW from sleeping
    event.ports?.[0]?.postMessage({ type: 'ALIVE' });
  }
});

// ── PERIODIC keep-alive ping ──────────────────────────────────────────
self.addEventListener('periodicsync', event => {
  if (event.tag === 'clock-pro-keepalive') {
    event.waitUntil(Promise.resolve());
  }
});
