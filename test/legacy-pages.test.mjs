import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildLegacyPages } from '../tools/build-legacy-pages.mjs';
import { buildCloudflare } from '../tools/build-cloudflare.mjs';
import { copySite } from '../tools/build-pages.mjs';
import { assertPublicVersion, readBuildStamp } from '../tools/check-cache-version.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const redirect = await readFile(new URL('../tools/legacy-pages/redirect.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../tools/legacy-pages/retire-sw.js', import.meta.url), 'utf8');

async function artifact(work) {
  const root = await mkdtemp(join(tmpdir(), 'finapp-legacy-'));
  try { await work({ root, out: join(root, 'pages') }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

async function follow(href, serviceWorker) {
  let destination;
  const elements = { continue: {}, recovery: {} };
  const context = vm.createContext({
    location: { href, replace: (value) => { destination = value; } },
    document: { getElementById: (name) => elements[name] },
    navigator: serviceWorker ? { serviceWorker } : {},
    URL, setTimeout, clearTimeout,
  });
  await vm.runInContext(redirect, context);
  return { destination, elements };
}

test('the common Pages adapter preserves each selected source and refuses unsafe recovery output', async () => {
  await artifact(async ({ root, out }) => {
    const devSource = join(root, 'selected-dev');
    await copySite(source, devSource);
    const marker = '<!-- selected development recovery -->';
    await writeFile(join(devSource, 'index.html'), (await readFile(join(devSource, 'index.html'), 'utf8')) + marker);
    await buildLegacyPages({ source, devSource, out, mainVersion: '0.1.2', devVersion: '1.2.3' });
    await assertPublicVersion(out, '0.1.2', 'recovery.html');
    await assertPublicVersion(join(out, 'dev'), '1.2.3', 'recovery.html');
    assert.equal((await readBuildStamp(out)).branch, 'main');
    assert.equal((await readBuildStamp(join(out, 'dev'))).branch, 'dev');
    assert.ok(!(await readFile(join(out, 'recovery.html'), 'utf8')).includes(marker));
    assert.ok((await readFile(join(out, 'dev/recovery.html'), 'utf8')).includes(marker));
    assert.equal(await readFile(join(out, 'dev/sw.js'), 'utf8'), worker);
    await assert.rejects(buildLegacyPages({ source, devSource, out: join(devSource, 'inside') }), /outside both source trees/);
    await writeFile(join(devSource, 'assets/js/deployment.js'), '// unsafe former namespace');
    await assert.rejects(buildLegacyPages({ source, devSource, out: join(root, 'unsafe') }), /must isolate/);
  });
});

test('legacy production, dev and historical paths keep shared fragments on a fixed HTTPS destination', async () => {
  for (const path of ['/finapp/', '/finapp/index.html', '/finapp/dev/', '/finapp/dev/index.html', '/finapp/old-link']) {
    const result = await follow(`https://sinikebe.github.io${path}?next=https://example.invalid/&private=discard#plan=abc-_123`);
    assert.equal(result.destination, 'https://finapp.siniverse.cc/#plan=abc-_123');
    assert.equal(result.elements.continue.href, result.destination);
    assert.equal(result.elements.recovery.href, `https://sinikebe.github.io/finapp/${path.includes('/dev/') ? 'dev/' : ''}recovery.html`);
  }
  for (const href of ['https://finapp.siniverse.cc/', 'https://finapp.siniverse.cc/finapp/',
    'https://sinikebe.github.io/Garapp/', 'https://sinikebe.github.io/']) {
    assert.equal((await follow(href)).destination, undefined, 'no loop or sibling-app redirection');
  }
});

test('the redirect updates only an existing worker for the matching Finapp scope', async () => {
  for (const scope of ['/finapp/', '/finapp/dev/']) {
    const calls = [];
    await follow(`https://sinikebe.github.io${scope}`, {
      getRegistration: async () => ({ scope: `https://sinikebe.github.io${scope}` }),
      register: async (script, options) => { calls.push({ script, options }); },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].script, `${scope}sw.js`);
    assert.equal(calls[0].options.scope, scope);
    assert.equal(calls[0].options.updateViaCache, 'none');
  }
  for (const scope of ['/', '/Garapp/', '/finapp/dev/']) {
    const result = await follow('https://sinikebe.github.io/finapp/', {
      getRegistration: async () => ({ scope: `https://sinikebe.github.io${scope}` }),
      register: async () => { assert.fail('must not replace a different registration'); },
    });
    assert.equal(result.destination, 'https://finapp.siniverse.cc/');
  }
  assert.equal((await follow('https://sinikebe.github.io/finapp/', {
    getRegistration: async () => { throw Error('Unavailable'); },
  })).destination, 'https://finapp.siniverse.cc/');
});

test('Pages redirects and recovery copies do not change the Workers bundle or source application', async () => {
  await artifact(async ({ root, out }) => {
    const original = await readFile(join(source, 'index.html'), 'utf8');
    const originalWorker = await readFile(join(source, 'sw.js'), 'utf8');
    await buildLegacyPages({ source, out });
    for (const preview of [false, true]) {
      const directory = preview ? join(out, 'dev') : out;
      const scope = preview ? '/finapp/dev/' : '/finapp/';
      const page = await readFile(join(directory, 'index.html'), 'utf8');
      assert.match(page, /<a id="continue" href="https:\/\/finapp\.siniverse\.cc\/">/);
      assert.ok(page.includes(`src="${scope}redirect.js"`));
      assert.ok(page.includes(`href="${scope}recovery.html"`));
      assert.doesNotMatch(page, /assets\/js\/app\.js/);
      assert.equal(await readFile(join(directory, '404.html'), 'utf8'), page);
      const recovery = await readFile(join(directory, 'recovery.html'), 'utf8');
      assert.match(recovery, /assets\/js\/app\.js/);
      assert.doesNotMatch(recovery, /redirect\.js/);
      if (!preview) assert.equal(recovery, original);
      assert.equal(await readFile(join(directory, 'assets/js/store.js'), 'utf8'),
        await readFile(join(source, 'assets/js/store.js'), 'utf8'));
      assert.equal(await readFile(join(directory, 'sw.js'), 'utf8'), worker);
    }
    assert.ok((await readdir(out)).includes('.nojekyll'));
    assert.ok(!(await readdir(out)).includes('test'));
    assert.ok(!(await readdir(out)).includes('.git'));
    await assert.rejects(buildLegacyPages({ source, out }), /EEXIST/);
    await assert.rejects(buildLegacyPages({ source, out: join(source, 'pages-output') }), /outside/);
    const cloudflare = join(root, 'worker');
    await buildCloudflare({ source, out: cloudflare, branch: 'main', domain: 'siniverse.cc' });
    assert.match(await readFile(join(cloudflare, 'index.html'), 'utf8'), /assets\/js\/app\.js/);
    assert.equal(await readFile(join(cloudflare, 'sw.js'), 'utf8'), originalWorker);
    assert.ok(!(await readdir(cloudflare)).includes('recovery.html'));
    assert.equal(await readFile(join(source, 'index.html'), 'utf8'), original);
  });
});

function retiring(scope) {
  const handlers = new Map();
  const calls = [];
  vm.runInNewContext(worker, {
    self: {
      location: new URL(`https://sinikebe.github.io${scope}sw.js`),
      registration: { scope: `https://sinikebe.github.io${scope}`, unregister: async () => { calls.push('unregister-self'); } },
      clients: { claim: async () => { calls.push('claim-own-scope'); } },
      skipWaiting: async () => { calls.push('skip-waiting'); },
      addEventListener: (type, handler) => handlers.set(type, handler),
    },
    URL, Response,
    caches: new Proxy({}, { get: () => { assert.fail('retirement must not read or delete caches'); } }),
  });
  return { handlers, calls };
}

test('retirement unregisters only itself without deleting caches or navigating open windows', async () => {
  for (const scope of ['/finapp/', '/finapp/dev/', '/', '/Garapp/']) {
    const instance = retiring(scope);
    for (const type of ['install', 'activate']) {
      let work;
      instance.handlers.get(type)({ waitUntil: (value) => { work = value; } });
      await work;
    }
    assert.deepEqual(instance.calls, scope.startsWith('/finapp/')
      ? ['skip-waiting', 'claim-own-scope', 'unregister-self'] : []);
  }
});

test('the transitional worker redirects Finapp navigations and leaves recovery, assets and sibling apps alone', () => {
  for (const scope of ['/finapp/', '/finapp/dev/']) {
    const { handlers } = retiring(scope);
    let response;
    handlers.get('fetch')({ request: { method: 'GET', mode: 'navigate',
      url: `https://sinikebe.github.io${scope}?private=discard#plan=abc` }, respondWith: (value) => { response = value; } });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), 'https://finapp.siniverse.cc/#plan=abc');
    for (const path of ['/Garapp/', '/Garapp/dev/', '/finapp/recovery.html', '/finapp/dev/recovery.html']) {
      handlers.get('fetch')({ request: { method: 'GET', mode: 'navigate', url: `https://sinikebe.github.io${path}` },
        respondWith: () => { assert.fail(`must not redirect ${path}`); } });
    }
    handlers.get('fetch')({ request: { method: 'GET', mode: 'cors', url: `https://sinikebe.github.io${scope}assets/js/app.js` },
      respondWith: () => { assert.fail('must not intercept application assets'); } });
  }
});
