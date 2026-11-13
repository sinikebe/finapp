import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

function worker({ cache, openError = false, networkError = false, networkResponse, scope = '/finapp/' } = {}) {
  const handlers = new Map();
  const response = networkResponse ?? { ok: true, status: 200, type: 'basic', clone() { return this; } };
  const context = vm.createContext({
    self: { location: new URL(`https://example.org${scope}sw.js`), addEventListener: (type, handler) => handlers.set(type, handler) },
    caches: { open: async () => { if (openError) throw Error('Unavailable'); return cache; } },
    fetch: async () => { if (networkError) throw Error('Offline'); return response; },
    URL, Response, Request,
  });
  vm.runInContext(source, context);
  return { handlers, response };
}

async function request(instance, path, mode = 'cors') {
  let result;
  instance.handlers.get('fetch')({
    request: { method: 'GET', url: `https://example.org${path}`, mode, redirect: mode === 'navigate' ? 'manual' : 'follow' },
    respondWith: (response) => { result = response; },
  });
  return result;
}

test('the offline generation contains every application module', async () => {
  const files = (await readdir(new URL('../assets/js', import.meta.url))).filter((file) => file.endsWith('.js'));
  let requests;
  const instance = worker({ cache: { addAll: async (entries) => { requests = entries; } } });
  let installing;
  instance.handlers.get('install')({ waitUntil: (work) => { installing = work; } });
  await installing;
  assert.ok(requests.every((request) => request.cache === 'reload'), 'a release must not reuse HTTP-cached bytes from an older deployment');
  const paths = requests.map((request) => './' + new URL(request.url).pathname.slice('/finapp/'.length));
  for (const file of files) assert.ok(paths.includes(`./assets/js/${file}`), file);
  assert.equal(new Set(paths).size, paths.length, 'no duplicate precache entries');
});

test('failed cache reads and writes still serve a valid network response', async () => {
  for (const mode of ['read', 'write', 'open']) {
    const cache = {
      match: async () => { if (mode === 'read') throw Error('Unavailable'); },
      put: async () => { throw Error('Quota'); },
    };
    for (const [path, requestMode] of [['/finapp/', 'navigate'], ['/finapp/assets/js/app.js', 'cors']]) {
      const instance = worker({ cache, openError: mode === 'open' });
      assert.equal(await request(instance, path, requestMode), instance.response);
    }
  }
});

test('cached generations work offline and leave sibling-app navigations alone', async () => {
  const cached = { status: 200 };
  const instance = worker({ cache: { match: async () => cached }, networkError: true });
  assert.equal(await request(instance, '/finapp/', 'navigate'), cached);
  assert.equal(await request(instance, '/finapp/assets/js/app.js'), cached);
  assert.equal(await request(instance, '/other-app/', 'navigate'), undefined);
  const missing = worker({ openError: true, networkError: true });
  assert.equal((await request(missing, '/finapp/', 'navigate')).type, 'error');
});

test('redirected HTML remains usable for normal and offline navigations without changing asset responses', async () => {
  const html = '<!doctype html><title>Finapp</title><main>Saved application shell</main>';
  // Workers Static Assets canonicalizes /index.html to /. A real fetch keeps
  // that redirect history; a plain Response fixture would miss this regression.
  const server = createServer((request, response) => {
    if (request.url === '/index.html') {
      response.writeHead(307, { Location: '/' }); response.end(); return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Shell-Version': 'cached' });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const redirected = await fetch(`http://127.0.0.1:${server.address().port}/index.html`);
    assert.equal(redirected.redirected, true);
    for (const scope of ['/', '/finapp/', '/finapp/dev/']) {
      for (const from of ['cache-online', 'cache-offline', 'network', 'fallback-cache']) {
        const original = redirected.clone();
        const cache = {
          match: async (key) => {
            if (from === 'network') return undefined;
            if (from === 'fallback-cache') return key === './index.html' ? undefined : original;
            return original;
          },
          put: async () => {},
        };
        const instance = worker({ scope, cache, networkResponse: original,
          networkError: from === 'cache-offline' || from === 'fallback-cache' });
        const shell = await request(instance, scope, 'navigate');
        assert.equal(shell.redirected, false, `${scope} ${from}: navigations must accept the cached response`);
        assert.equal(shell.status, original.status);
        assert.equal(shell.statusText, original.statusText);
        assert.equal(shell.headers.get('Content-Type'), 'text/html; charset=utf-8');
        assert.equal(shell.headers.get('X-Shell-Version'), 'cached');
        assert.equal(await shell.text(), html);
      }
    }
    const asset = redirected.clone();
    const instance = worker({ cache: { match: async () => asset } });
    assert.equal(await request(instance, '/finapp/assets/js/app.js'), asset,
      'redirect metadata for other assets is not rewritten');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('even a root development worker leaves Garapp resources and other app scopes alone', async () => {
  const cached = { status: 200 };
  for (const scope of ['/', '/finapp/', '/finapp/dev/']) {
    const instance = worker({ scope, cache: { match: async () => cached }, networkError: true });
    assert.equal(await request(instance, '/Garapp/dev/assets/js/app.js'), undefined);
    assert.equal(await request(instance, '/Garapp/dev/assets/css/app.css'), undefined);
    assert.equal(await request(instance, '/Garapp/dev/', 'navigate'), undefined);
    assert.equal(await request(instance, `${scope}assets/js/app.js`), cached);
  }
});


test('activating main or dev only removes that scope’s older cache generations', async () => {
  for (const scope of ['/finapp/', '/finapp/dev/']) {
    const own = `finapp@${encodeURIComponent(scope)}:`;
    const other = `finapp@${encodeURIComponent(scope === '/finapp/' ? '/finapp/dev/' : '/finapp/')}:`;
    const deleted = [];
    const version = source.match(/^const CACHE_VERSION = '([^']+)'/m)[1];
    const names = [own + 'v1', own + version, other + 'v66', 'unrelated', 'finapp-v66'];
    const handlers = new Map(); let activating;
    const context = vm.createContext({
      self: { location: new URL(`https://example.org${scope}sw.js`), addEventListener: (key, work) => handlers.set(key, work), clients: { claim() {} } },
      caches: { keys: async () => names, delete: async (key) => deleted.push(key) }, URL,
    });
    vm.runInContext(source, context);
    handlers.get('activate')({ waitUntil: (work) => { activating = work; } });
    await activating;
    assert.deepEqual(deleted, [own + 'v1']);
  }
});
