/**
 * sw.js — offline shell.
 *
 * The cache is treated as one immutable generation: index.html, the CSS and the
 * JS are precached together on install and served together from that same
 * generation. Nothing is refreshed behind the app's back, so a reader never gets
 * a fresh page wired to stale scripts. A new version arrives as a whole — a new
 * worker installs its own cache and the app offers a Reload — which is why
 * CACHE_VERSION must be bumped whenever a precached file changes.
 */

const CACHE_VERSION = 'v23';
const CACHE_PREFIX = 'finapp-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const SHELL = './index.html';

const PRECACHE = [
  SHELL,
  './manifest.webmanifest',
  './manifest.fr.webmanifest',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/chart.js',
  './assets/js/dom.js',
  './assets/js/field-list.js',
  './assets/js/fields.js',
  './assets/js/format.js',
  './assets/js/i18n.js',
  './assets/js/projection.js',
  './assets/js/sankey.js',
  './assets/js/strategies.js',
  './assets/js/strategy-bar.js',
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
    // Only this app's own generations: the origin may host other apps whose
    // caches are none of our business.
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** Store a response only if it is a complete, same-origin, cacheable one. */
async function cacheIfSound(cache, request, response) {
  if (!response || !response.ok || response.status !== 200 || response.type !== 'basic') return;
  await cache.put(request, response.clone());
}

/** True for the app's own pages, and only those — a sibling app sharing this
 * origin keeps its own navigations. */
function isAppPage(url) {
  const base = new URL('./', self.location.href).pathname;
  return url.pathname === base || url.pathname === `${base}index.html`;
}

/**
 * Navigations are answered from this worker's own shell, so the page always
 * matches the scripts beside it. The network is only asked when the shell is
 * missing — the very first visit, or a cache that was evicted.
 */
async function serveShell(event) {
  const cache = await caches.open(CACHE_NAME);
  const shell = await cache.match(SHELL);
  if (shell) return shell;

  try {
    const response = await fetch(event.request);
    await cacheIfSound(cache, SHELL, response);
    return response;
  } catch {
    return (await cache.match(event.request)) || Response.error();
  }
}

/** Everything else: this generation's copy, or the network on a miss. */
async function serveAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    await cacheIfSound(cache, request, response);
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    if (isAppPage(url)) event.respondWith(serveShell(event));
    return;
  }

  event.respondWith(serveAsset(request));
});
