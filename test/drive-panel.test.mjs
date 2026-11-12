import test from 'node:test';
import assert from 'node:assert/strict';
import { FinappDrivePanel } from '../assets/js/finapp-drive-panel.js';
import { makeTranslator } from '../assets/js/i18n.js';

class Element {
  constructor() {
    this.listeners = new Map(); this.children = []; this.dataset = {};
    this.value = ''; this.hidden = false; this.open = false; this.disabled = false;
    this.textContent = '';
    this.attributes = new Map();
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  emit(type) { for (const listener of this.listeners.get(type) ?? []) listener({ preventDefault() {} }); }
  replaceChildren(...children) { this.children = children; this.value = ''; }
  append(...children) { this.children.push(...children); }
  querySelectorAll() { return []; }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit('close'); }
  remove() {}
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

async function withPanel(run, initial = {}, options = {}) {
  const previous = Object.fromEntries(['document', 'window', 'navigator', 'fetch'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const elements = new Map(), values = new Map(Object.entries(initial));
  const element = (id) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  let scriptLoads = 0;
  const document = {
    getElementById: element,
    createElement: () => new Element(),
    querySelector: () => element('tools-menu'),
    addEventListener() {},
    visibilityState: 'visible',
    head: { append(script) { scriptLoads++; queueMicrotask(() => script.onerror()); } },
  };
  const window = { addEventListener() {}, setInterval: () => 1, setTimeout, clearTimeout,
    location: options.location ?? { href: 'https://example.org/finapp/' }, history: options.history };
  for (const [name, value] of Object.entries({ document, window, navigator: { onLine: true } })) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  if (options.fetcher) Object.defineProperty(globalThis, 'fetch', { configurable: true, value: options.fetcher });
  const storage = () => ({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  });
  const panel = new FinappDrivePanel({
    base: new URL(options.base ?? 'https://example.org/finapp/'), development: false,
    getWorkspace: () => { throw Error('Unexpected workspace access'); },
    canSync: () => false, canApply: () => false,
    applyWorkspace: async () => { throw Error('Unexpected replace'); },
    storage, t: () => makeTranslator('en'), language: () => 'en',
    download: async () => { throw Error('Unexpected download'); },
  });
  try { await panel.restore(); await run({ panel, element, values, scriptLoads: () => scriptLoads }); }
  finally {
    panel.auth?.disconnect?.();
    clearTimeout(panel.timer);
    clearTimeout(panel.profileTimer);
    for (const [name, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

test('Google Identity is requested only after opening Drive, and a failed load can be retried', async () => {
  await withPanel(async ({ panel, element, scriptLoads }) => {
    assert.equal(scriptLoads(), 0);
    assert.equal(element('drive-connect').disabled, false);
    element('drive-open').emit('click');
    await new Promise(setImmediate);
    assert.equal(scriptLoads(), 1);
    assert.equal(element('drive-dialog').open, true);
    assert.equal(element('drive-connect').disabled, false);
    assert.equal(element('drive-connect').textContent, makeTranslator('en')('drive.retry'));
    element('drive-connect').emit('click');
    await new Promise(setImmediate);
    assert.equal(scriptLoads(), 2);
    assert.equal(panel.auth, null);
  });
});

test('a previous connection prepares sign-in without storing a token or opening a popup on load', async () => {
  await withPanel(async ({ element, scriptLoads }) => {
    assert.equal(scriptLoads(), 1);
    assert.equal(element('drive-dialog').open, false);
    assert.equal(element('drive-profile').dataset.connected, 'false');
    assert.equal(element('drive-profile-mark').textContent, '!');
  }, { 'finapp.drive.connectedBefore': '1' });
});

test('a production Worker session restores Drive after reopening even without a browser reconnect flag', async () => {
  const calls = [], app = 'https://finapp.siniverse.cc/';
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/session')) return Response.json({ connected: true });
    if (String(url).endsWith('/token')) return Response.json({ access_token: 'short-token', expires_in: 120 });
    if (String(url).endsWith('/disconnect')) return new Response(null, { status: 204 });
    if (String(url).includes('/about?')) return Response.json({ user: { displayName: 'Synthetic Name' } });
    return Response.json({ files: [] });
  };
  await withPanel(async ({ panel, element, values, scriptLoads }) => {
    assert.equal(scriptLoads(), 0, 'restoring an HttpOnly session does not load the popup SDK');
    assert.equal(panel.connected(), true);
    assert.equal(element('drive-profile').dataset.connected, 'true');
    assert.equal(values.get('finapp.drive.connectedBefore'), '1');
    assert.equal(calls[0].url, 'https://api.siniverse.cc/v1/finapp/session');
    assert.ok(calls.some(({ url, options }) => url.endsWith('/token') && options.credentials === 'include'));
    assert.ok(calls.some(({ url, options }) => url.includes('/drive/v3/')
      && options.credentials === 'omit' && options.headers.Authorization === 'Bearer short-token'));
    assert.doesNotMatch(JSON.stringify([...values]), /short-token|Synthetic Name/);
  }, {}, { base: app, location: { href: app }, fetcher });
});

test('a failed production session probe never starts a Drive transfer or replaces local data', async () => {
  await withPanel(async ({ panel, element, scriptLoads, values }) => {
    assert.equal(panel.connected(), false);
    assert.equal(panel.auth, null);
    assert.equal(scriptLoads(), 0);
    assert.equal(values.size, 0);
    assert.equal(element('drive-connect').disabled, false);
    element('drive-open').emit('click');
    await new Promise(setImmediate);
    assert.equal(scriptLoads(), 1, 'the legacy sign-in remains available after an explicit click');
  }, {}, { base: 'https://finapp.siniverse.cc/',
    fetcher: async () => { throw Error('Network is unavailable'); } });
});

test('a production connection navigates through the API without forwarding the shared plan', async () => {
  const navigations = [];
  await withPanel(async ({ panel, element, scriptLoads }) => {
    assert.equal(panel.auth.isConnected(), false);
    assert.equal(scriptLoads(), 0);
    element('drive-connect').emit('click');
    assert.equal(navigations.length, 1);
    const navigation = new URL(navigations[0]);
    assert.equal(navigation.origin, 'https://api.siniverse.cc');
    assert.equal(navigation.searchParams.get('return_to'), 'https://finapp.siniverse.cc/');
    assert.doesNotMatch(navigations[0], /private-query|shared-plan/);
  }, {}, { base: 'https://finapp.siniverse.cc/',
    location: { href: 'https://finapp.siniverse.cc/?query=private-query#shared-plan',
      assign: (url) => navigations.push(url) },
    fetcher: async (url, options) => String(url).endsWith('/disconnect')
      ? new Response(null, { status: 204 }) : Response.json({ connected: false }) });
});

test('a denied Google consent shows a neutral error and removes the redirect marker while preserving the plan', async () => {
  const replacements = [];
  await withPanel(async ({ panel, element, scriptLoads }) => {
    assert.equal(panel.problem, makeTranslator('en')('drive.connectionFailed'));
    assert.equal(element('drive-status').textContent, panel.problem);
    assert.equal(scriptLoads(), 0);
    assert.deepEqual(replacements, [['session-state', '/?theme=dark#shared-plan']]);
  }, {}, { base: 'https://finapp.siniverse.cc/',
    location: { href: 'https://finapp.siniverse.cc/?theme=dark&drive_auth=failed#shared-plan' },
    history: { state: 'session-state', replaceState: (_state, _title, path) => replacements.push([_state, path]) },
    fetcher: async (url, options) => String(url).endsWith('/disconnect')
      ? new Response(null, { status: 204 }) : Response.json({ connected: false }) });
});

test('profile button reconnects directly when the SDK is ready; account identity stays in memory', async () => {
  await withPanel(async ({ panel, element, values }) => {
    let chooserRequests = 0;
    panel.auth = { token: () => null, pending: false, connect() { chooserRequests++; }, disconnect() {} };
    element('drive-profile').emit('click');
    assert.equal(chooserRequests, 1);
    assert.equal(element('drive-dialog').open, true);
    assert.equal(element('drive-profile').dataset.connected, 'false');
    assert.match(element('drive-profile').getAttribute('aria-label'), /Connect to Google Drive/);

    panel.auth.token = () => 'memory-only-token';
    panel.engine.api = { close() {} };
    panel.account = { name: 'Synthetic Name', email: 'synthetic@example.org' };
    panel.render();
    assert.equal(element('drive-profile').dataset.connected, 'true');
    assert.equal(element('drive-profile-mark').textContent, '✓');
    assert.equal(element('drive-profile-label').textContent, 'Synthetic Name');
    assert.match(element('drive-profile').getAttribute('aria-label'), /synthetic@example.org/);
    assert.equal(element('drive-account').textContent, 'Synthetic Name · synthetic@example.org');
    assert.equal(values.size, 0, 'Google identity and access token are not persisted');

    panel.auth.token = () => null;
    panel.render();
    assert.equal(panel.account, null);
    assert.equal(element('drive-profile').dataset.connected, 'false');
    assert.equal(element('drive-account').hidden, true);
  });
});

test('profile changes to disconnected as soon as the memory-only token becomes unusable', async () => {
  await withPanel(async ({ panel, element, values }) => {
    let token = 'synthetic-memory-token', refresh;
    values.set('finapp.drive.connectedBefore', '1');
    window.setTimeout = (callback, delay) => { refresh = { callback, delay }; return 1; };
    window.clearTimeout = () => {};
    panel.auth = { token: () => token, timeUntilExpiration: () => 1200, disconnect() {} };
    panel.engine.api = { close() {} };
    panel.render();
    assert.equal(refresh.delay, 1201);
    assert.equal(element('drive-profile').dataset.connected, 'true');
    token = null;
    refresh.callback();
    assert.equal(element('drive-profile').dataset.connected, 'false');
    assert.equal(element('drive-profile-mark').textContent, '!');
    assert.equal(panel.profileTimer, null);
    assert.equal(values.get('finapp.drive.connectedBefore'), '1', 'passive expiry does not forget the prior connection');
  });
});

test('explicit disconnect forgets the reconnection preference without touching backup settings', async () => {
  await withPanel(async ({ panel, element, values }) => {
    values.set('finapp.drive.connectedBefore', '1');
    values.set('finapp.drive.v1', '{"auto":true}');
    panel.auth = { token: () => 'synthetic-token', disconnect() {} };
    panel.engine.api = { close() {} };
    panel.disconnect();
    assert.equal(values.has('finapp.drive.connectedBefore'), false);
    assert.equal(values.get('finapp.drive.v1'), '{"auto":true}');
    assert.equal(element('drive-profile').dataset.connected, 'false');
  });
});

test('successful Drive sign-in remembers only a reconnect preference', async () => {
  const previousFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const requests = [];
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (url) => {
    requests.push(url);
    return new Response(JSON.stringify({ user: { displayName: 'Synthetic Name', emailAddress: 'synthetic@example.org' } }));
  } });
  try {
    await withPanel(async ({ panel, element, values }) => {
      panel.auth = { token: () => 'private-synthetic-token', pending: false, disconnect() {} };
      panel.engine.folders = async () => [];
      await panel.onConnected();
      await new Promise(setImmediate);
      assert.equal(values.get('finapp.drive.connectedBefore'), '1');
      assert.equal(values.size, 1);
      assert.equal(element('drive-profile-label').textContent, 'Synthetic Name');
      assert.doesNotMatch(JSON.stringify([...values]), /private-synthetic-token|synthetic@example.org/);
      assert.equal(requests.length, 1);
      assert.match(requests[0], /\/drive\/v3\/about\?/);
    });
  } finally {
    if (previousFetch) Object.defineProperty(globalThis, 'fetch', previousFetch);
    else delete globalThis.fetch;
  }
});

test('a selected Drive folder survives rerenders and a refreshed folder list', async () => {
  await withPanel(async ({ panel, element }) => {
    panel.auth = { token: () => 'synthetic-token', disconnect() {} };
    panel.engine.api = { close() {} };
    panel.folders = [{ id: 'folder-one', name: 'Synthetic first' }];
    assert.doesNotThrow(() => panel.render());
    const picker = element('drive-folders');
    assert.equal(picker.children.length, 2);
    picker.value = 'folder-one'; picker.emit('change');
    panel.render();
    assert.equal(picker.value, 'folder-one');
    panel.folders = [...panel.folders, { id: 'folder-two', name: 'Synthetic second' }];
    assert.doesNotThrow(() => panel.render());
    assert.equal(picker.value, 'folder-one');
    assert.equal(element('drive-use').disabled, false);
  });
});

test('Drive settings persist the backup binding without serializing an OAuth token', async () => {
  await withPanel(async ({ panel, values }) => {
    panel.auth = { token: () => 'private-synthetic-access-token', disconnect() {} };
    panel.engine.state = {
      binding: { id: 'folder-synthetic', name: 'Synthetic backup' }, auto: true,
      baseline: { hash: 'a'.repeat(64), heads: [] }, checkedAt: '2026-01-01T00:00:00.000Z',
    };
    await panel.engine.persist();
    const stored = values.get('finapp.drive.v1');
    assert.ok(stored);
    assert.doesNotMatch(stored, /private-synthetic-access-token|accessToken|expiresAt|refresh_token/);
    assert.deepEqual(JSON.parse(stored), panel.engine.state);
  });
});
