import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

function worker({ cache, openError = false, networkError = false } = {}) {
  const handlers = new Map();
  const response = { ok: true, status: 200, type: 'basic', clone() { return this; } };
  const context = vm.createContext({
    self: { location: new URL('https://example.org/finapp/sw.js'), addEventListener: (type, handler) => handlers.set(type, handler) },
    caches: { open: async () => { if (openError) throw Error('Unavailable'); return cache; } },
    fetch: async () => { if (networkError) throw Error('Offline'); return response; },
    URL, Response,
  });
  vm.runInContext(source, context);
  return { handlers, response };
}

async function request(instance, path, mode = 'cors') {
  let result;
  instance.handlers.get('fetch')({
    request: { method: 'GET', url: `https://example.org${path}`, mode },
    respondWith: (response) => { result = response; },
  });
  return result;
}

test('the offline generation contains every application module', async () => {
  const files = (await readdir(new URL('../assets/js', import.meta.url))).filter((file) => file.endsWith('.js'));
  let paths;
  const instance = worker({ cache: { addAll: async (entries) => { paths = entries; } } });
  let installing;
  instance.handlers.get('install')({ waitUntil: (work) => { installing = work; } });
  await installing;
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


test('activating main or dev only removes that scope’s older cache generations', async () => {
  for (const scope of ['/finapp/', '/finapp/dev/']) {
    const own = `finapp@${encodeURIComponent(scope)}:`;
    const other = `finapp@${encodeURIComponent(scope === '/finapp/' ? '/finapp/dev/' : '/finapp/')}:`;
    const deleted = [];
    const names = [own + 'v1', own + 'v67', other + 'v66', 'unrelated', 'finapp-v66'];
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
