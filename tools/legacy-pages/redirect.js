/* Only the retired Finapp Pages paths use this script. */
(async () => {
  const source = new URL(location.href);
  const target = new URL('https://finapp.siniverse.cc/');
  if (source.origin === target.origin || !source.pathname.startsWith('/finapp/')) return;
  // Shared plans live in the fragment. Query parameters are not application data.
  target.hash = source.hash;
  document.getElementById('continue').href = target.href;
  const scope = source.pathname.startsWith('/finapp/dev/') ? '/finapp/dev/' : '/finapp/';
  document.getElementById('recovery').href = new URL(`${scope}recovery.html`, source.origin).href;

  // An installed cache-first worker must receive its replacement too. Never
  // register over a sibling app's worker, and never delay navigation indefinitely.
  if ('serviceWorker' in navigator) {
    let timer;
    try {
      await Promise.race([
        (async () => {
          const registration = await navigator.serviceWorker.getRegistration(source.href);
          if (registration?.scope !== new URL(scope, source.origin).href) return;
          await navigator.serviceWorker.register(`${scope}sw.js`, { scope, updateViaCache: 'none' });
        })(),
        new Promise((resolve) => { timer = setTimeout(resolve, 1500); }),
      ]);
    } catch { /* The link and the new application work without offline support. */ }
    finally { clearTimeout(timer); }
  }
  location.replace(target.href);
})();
