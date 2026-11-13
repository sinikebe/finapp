/**
 * sw.js — offline shell.
 *
 * The cache is treated as one immutable generation: index.html, the CSS and the
 * JS are precached together on install and served together from that same
 * generation. Nothing is refreshed behind the app's back, so a reader never gets
 * a fresh page wired to stale scripts. A new version arrives as a whole — a new
 * worker installs its own cache and the app offers a Reload. The build combines the technical baseline below with its public version and
 * a content fingerprint, so asset changes never depend on a manual counter bump.
 */

const CACHE_VERSION = 'v85';
// Scope-specific and outside the legacy finapp- prefix, so v66 cannot delete /dev/ caches.
const CACHE_PREFIX = `finapp@${encodeURIComponent(new URL('./', self.location.href).pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const SHELL = './index.html';

const PRECACHE = [
  SHELL,
  './manifest.webmanifest',
  './manifest.fr.webmanifest',
  './assets/css/app.css',
  './assets/css/finapps-ui.css',
  './assets/css/help.css',
  './assets/css/drive.css',
  './assets/js/help.js',
  './assets/css/workspace.css',
  './assets/css/app-switcher.css',
  './assets/js/app-switcher.js',
  './assets/js/workspace.js',
  './assets/js/workspace-view.js',
  './assets/js/workspace-cards.js',
  './assets/js/browser-tools.js',
  './assets/js/app.js',
  './assets/js/interface-view.js',
  './assets/js/interface.js',
  './assets/js/save-controller.js',
  './assets/js/input-validation.js',
  './assets/js/deployment.js',
  './assets/js/deployment-config.js',
  './assets/js/backup.js',
  './assets/js/legacy-rescue.js',
  './assets/js/backup-merge.js',
  './assets/js/finapp-drive-config.js',
  './assets/js/finapp-drive-auth.js',
  './assets/js/finapp-drive-api.js',
  './assets/js/finapp-drive-format.js',
  './assets/js/finapp-drive-sync.js',
  './assets/js/finapp-drive-panel.js',
  './assets/js/finapp-worker-session.js',
  './assets/js/field-labels.js',
  './assets/js/store.js',
  './assets/js/state.js',
  './assets/js/scenarios.js',
  './assets/js/plan-operations.js',
  './assets/js/numbers.js',
  './assets/js/chart.js',
  './assets/js/changelog.js',
  './assets/js/dom.js',
  './assets/js/field-list.js',
  './assets/js/fields.js',
  './assets/js/format.js',
  './assets/js/history.js',
  './assets/js/i18n.js',
  './assets/js/milestone-list.js',
  './assets/js/milestones.js',
  './assets/js/project-switch.js',
  './assets/js/projection.js',
  './assets/js/projects.js',
  './assets/js/templates.js',
  './assets/js/car-energy.js',
  './assets/js/example-context.js',
  './assets/js/sankey.js',
  './assets/js/schedule.js',
  './assets/js/share.js',
  './assets/js/solve.js',
  './assets/js/strategies.js',
  './assets/js/strategy-bar.js',
  './assets/js/version.js',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE.map((path) => (
      // Each release must fetch its own bytes, even while the previous release
      // is still fresh in the browser's separate HTTP cache.
      new Request(new URL(path, self.location.href), { cache: 'reload' })
    )))),
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
  if (!cache || !response || !response.ok || response.status !== 200 || response.type !== 'basic') return;
  try { await cache.put(request, response.clone()); } catch { /* keep serving the valid network response */ }
}

async function cachedResponse(cache, request) {
  try { return await cache?.match(request); } catch { return undefined; }
}

/** A followed /index.html redirect is still redirected after CacheStorage.
 * Navigations use redirect: 'manual' and reject that response with a network
 * error. Keep the shell's body, status and headers without its redirect history.
 */
function navigationResponse(response) {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status, statusText: response.statusText, headers: response.headers,
  });
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
  const cache = await caches.open(CACHE_NAME).catch(() => null);
  const shell = await cachedResponse(cache, SHELL);
  if (shell) return navigationResponse(shell);

  try {
    const response = await fetch(event.request);
    await cacheIfSound(cache, SHELL, response);
    return navigationResponse(response);
  } catch {
    return navigationResponse((await cachedResponse(cache, event.request)) || Response.error());
  }
}

/** Everything else: this generation's copy, or the network on a miss. */
async function serveAsset(request) {
  const cache = await caches.open(CACHE_NAME).catch(() => null);
  const cached = await cachedResponse(cache, request);
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

  const base = new URL('./', self.location.href).pathname;
  const ownFile = PRECACHE.some((path) => new URL(path, self.location.href).pathname === url.pathname);
  if (!ownFile && !url.pathname.startsWith(`${base}assets/`)) return;
  event.respondWith(serveAsset(request));
});
