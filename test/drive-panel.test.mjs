import test from 'node:test';
import assert from 'node:assert/strict';
import { FinappDrivePanel } from '../assets/js/finapp-drive-panel.js';
import { makeTranslator } from '../assets/js/i18n.js';

class Element {
  constructor() {
    this.listeners = new Map(); this.children = []; this.dataset = {};
    this.value = ''; this.hidden = false; this.open = false; this.disabled = false;
    this.textContent = '';
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
}

async function withPanel(run) {
  const previous = Object.fromEntries(['document', 'window', 'navigator'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const elements = new Map(), values = new Map();
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
  const window = { addEventListener() {}, setInterval: () => 1, setTimeout, clearTimeout };
  for (const [name, value] of Object.entries({ document, window, navigator: { onLine: true } })) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  const storage = () => ({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  const panel = new FinappDrivePanel({
    base: new URL('https://example.org/finapp/'), development: false,
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
