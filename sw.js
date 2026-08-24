/**
 * sw.js — offline shell.
 *
 * Navigations are network-first so a deploy is picked up on the next online
 * visit; everything else is served from the cache and refreshed in the
 * background. Bump CACHE_VERSION whenever a precached file changes.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `finapp-${CACHE_VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/chart.js',
  './assets/js/format.js',
  './assets/js/i18n.js',
  './assets/js/projection.js',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => (name === CACHE_NAME ? null : caches.delete(name))));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(event) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || await fetch(event.request);
    if (response && response.ok) cache.put('./index.html', response.clone());
    return response;
  } catch {
    return (await cache.match(event.request))
      || (await cache.match('./index.html'))
      || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event));
    return;
  }

  event.respondWith(cacheFirst(request));
});
