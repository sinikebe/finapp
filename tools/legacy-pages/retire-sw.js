/* Retire only Finapp's old Pages workers; browser projects and caches stay intact. */
const scope = new URL(self.registration.scope);
const ownScope = scope.origin === self.location.origin
  && ['/finapp/', '/finapp/dev/'].includes(scope.pathname)
  && new URL(self.location.href).pathname === `${scope.pathname}sw.js`;

self.addEventListener('install', (event) => {
  if (ownScope) event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  if (!ownScope) return;
  event.waitUntil((async () => {
    await self.clients.claim();
    await self.registration.unregister();
  })());
});

self.addEventListener('fetch', (event) => {
  if (!ownScope || event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  const source = new URL(event.request.url);
  if (source.origin !== scope.origin || !source.pathname.startsWith(scope.pathname)) return;
  if (['/finapp/recovery.html', '/finapp/dev/recovery.html'].includes(source.pathname)) return;
  const target = new URL('https://finapp.siniverse.cc/');
  target.hash = source.hash;
  event.respondWith(Response.redirect(target.href, 302));
});
