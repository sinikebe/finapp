import test from 'node:test';
import assert from 'node:assert/strict';
import { readNumericInput, bindNumericInput } from '../assets/js/input-validation.js';
import { viewModeOf, guidedPlan, advancedFields } from '../assets/js/interface.js';
import { parseBackup, MAX_BACKUP_BYTES } from '../assets/js/backup.js';
import { deploymentFor, deploymentTitle, scopedStorage } from '../assets/js/deployment.js';
import { createSaveController } from '../assets/js/save-controller.js';
import { createPlanStore } from '../assets/js/store.js';
import { loadWorkspace, snapshotOf, METRICS } from '../assets/js/state.js';
import { makeTranslator } from '../assets/js/i18n.js';
import { createScenarioRunner } from '../assets/js/scenarios.js';
import { TEMPLATES } from '../assets/js/templates.js';

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

test('development page and home-screen names remain distinct when the language changes', () => {
  for (const language of ['en', 'fr']) {
    const title = makeTranslator(language)('doc.title');
    const main = deploymentFor('https://example.org/finapp/');
    const dev = deploymentFor('https://example.org/finapp/dev/');
    assert.equal(deploymentTitle(title, main.preview), title);
    assert.ok(deploymentTitle(title, dev.preview).startsWith('Finapp dev — '));
    assert.equal(deploymentTitle('Finapp', main.preview), 'Finapp');
    assert.equal(deploymentTitle('Finapp', dev.preview), 'Finapp dev');
    assert.equal(deploymentTitle(deploymentTitle(title, true), true), deploymentTitle(title, true));
  }
});

test('amounts accept currency affixes and grouping, rates keep decimal commas', () => {
  for (const text of ['2 200 €', 'EUR 2 200', '$2,200', '2\u202f200 EUR']) assert.equal(readNumericInput(text).number, 2200);
  assert.equal(readNumericInput('3,125 %', { rate: true }).number, 3.125);
  for (const text of ['oops', '2200 xyz', '€€2200', '1,2,3', 'Infinity', '1e999', '-5', '100000000001']) assert.equal(readNumericInput(text).valid, false, text);
  assert.equal(readNumericInput('-3,125', { rate: true, signed: true }).number, -3.125);
  assert.equal(readNumericInput('-1', { rate: true, min: 0 }).valid, false);
  assert.equal(readNumericInput('2.5', { integer: true }).reason, 'integer');
  assert.deepEqual(readNumericInput(''), { valid: true, text: '', number: 0 });
});

test('guided personal projects start blank and comparison shares only common identities', () => {
  for (const language of ['en', 'fr']) for (const kind of ['budget', 'compare', 'savings']) {
    const plan = guidedPlan(kind, makeTranslator(language));
    assert.equal(plan.strategies.length, kind === 'compare' ? 2 : 1);
    assert.ok(plan.strategies.every((one) => one.origin === 'own' && one.fields.every((field) => field.amount === '')));
    if (kind === 'compare') assert.deepEqual(plan.strategies[0].fields.map((one) => one.id), plan.strategies[1].fields.map((one) => one.id));
    if (kind === 'savings') assert.equal(plan.milestones[0].metric, 'net');
  }
});

test('presentation choices never affect conditional projections or backup identity', () => {
  const state = loadWorkspace();
  const original = JSON.stringify(snapshotOf(state));
  const run = createScenarioRunner(state);
  const before = state.strategies.map((one) => run.run(one.fields).totals);
  for (const mode of ['simple', 'advanced', 'invalid', 'simple']) {
    assert.ok(['simple', 'advanced'].includes(viewModeOf(mode)));
    advancedFields(state.strategies.flatMap((one) => one.fields));
  }
  assert.equal(JSON.stringify(snapshotOf(state)), original);
  assert.deepEqual(state.strategies.map((one) => run.run(one.fields).totals), before);
});

test('a full backup round-trips all projects and conditional references', () => {
  const workspace = snapshotOf(loadWorkspace());
  const parsed = parseBackup(JSON.stringify({ version: 1, workspace, drafts: [{ snapshot: workspace, updatedAt: 10 }] }));
  assert.deepEqual(parsed.workspace, workspace);
  assert.deepEqual(parsed.drafts[0].snapshot, workspace);
  assert.equal(parsed.workspace.shelf.projects.length, TEMPLATES.length + 1);
});

test('backup validation refuses unsupported, oversized, corrupt or lossy restores', () => {
  const workspace = snapshotOf(loadWorkspace());
  const backup = () => ({ version: 1, workspace: structuredClone(workspace) });
  assert.throws(() => parseBackup('not json'));
  assert.throws(() => parseBackup(JSON.stringify({ ...backup(), version: 99 })), { code: 'version' });
  assert.throws(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), { code: 'tooLarge' });
  for (const alter of [
    (value) => { value.workspace.flat.strategies[0].fields[0].amount = 'bad'; },
    (value) => { value.workspace.flat.months = 900; },
    (value) => { value.workspace.shelf.projects.push(value.workspace.shelf.projects[0]); },
    (value) => { value.workspace.flat.strategies[0].fields[0].startAt = 'missing'; },
    (value) => { value.workspace.shelf.projects[1].plan.strategies = []; },
  ]) { const value = backup(); alter(value); assert.throws(() => parseBackup(JSON.stringify(value))); }
});

test('main and dev storage, drafts, preference enumeration and events are isolated', () => {
  const db = new MemoryStorage();
  const main = scopedStorage(() => db, deploymentFor('https://example.org/finapp/').prefix);
  const dev = scopedStorage(() => db, deploymentFor('https://example.org/finapp/dev/').prefix);
  for (const key of ['finapp.workspace.v1', 'finapp.draft.v1.A', 'finapp.viewMode.v1', 'finapp.navigation.v1']) {
    main.storage().setItem(key, 'main'); dev.storage().setItem(key, 'dev');
    assert.equal(main.storage().getItem(key), 'main'); assert.equal(dev.storage().getItem(key), 'dev');
    assert.equal(main.logical(dev.physical(key)), undefined); assert.equal(dev.logical(main.physical(key)), undefined);
  }
  assert.equal(main.storage().length, 4); assert.equal(dev.storage().length, 4);
  dev.storage().removeItem('finapp.workspace.v1'); assert.equal(main.storage().getItem('finapp.workspace.v1'), 'main');
  assert.equal(dev.logical(null), null);
  assert.equal(deploymentFor('https://example.org/finapp/').preview, false);
  assert.equal(deploymentFor('https://example.org/finapp/dev/').preview, true);
});

function fixture({ delayed = false } = {}) {
  const db = new MemoryStorage();
  let release;
  const withLock = delayed ? (work) => new Promise((resolve) => { release = () => resolve(work()); }) : async (work) => work();
  const store = createPlanStore(() => db, { withLock, tabId: 'tab' });
  let value = { count: 1 };
  const queue = new Map(); let id = 0;
  const clock = { setTimeout(work) { queue.set(++id, work); return id; }, clearTimeout(key) { queue.delete(key); } };
  const controller = createSaveController({ store, snapshot: () => value, adopt: (next) => { value = next; }, clock });
  return { db, store, controller, queue, set: (next) => { value = next; }, release: () => release() };
}

test('typing then reverting before debounce clears saving and the obsolete draft', async () => {
  const f = fixture();
  f.set({ count: 2 }); f.controller.persist(); assert.equal(f.controller.status().state, 'pending');
  f.set({ count: 1 }); f.controller.persist();
  assert.equal(f.controller.status().state, 'saved'); assert.equal(f.controller.status().dirty, false);
  assert.equal(f.queue.size, 0);
  assert.ok(![...f.db.values.keys()].some((key) => key.startsWith('finapp.draft.v1.')));
});

test('undo while an older save waits on a lock is persisted after that save', async () => {
  const f = fixture({ delayed: true });
  f.set({ count: 2 }); f.controller.persist(); const first = f.controller.save();
  f.set({ count: 1 }); f.controller.persist();
  f.release(); await first;
  assert.equal(f.controller.status().dirty, true);
  const next = f.controller.save(); f.release(); await next;
  assert.equal(f.controller.status().dirty, false); assert.equal(f.controller.status().state, 'saved');
});

test('restoration rejects an unseen concurrent revision', async () => {
  const f = fixture();
  await f.store.save({ count: 99 }, f.store.read().token);
  assert.equal((await f.controller.replace({ count: 3 })).status, 'conflict');
  assert.equal(f.controller.status().pendingRemote, true);
});

test('a protected recovery is independent from the active tab draft', () => {
  const db = new MemoryStorage(); const store = createPlanStore(() => db, { tabId: 'tab' });
  const workspace = snapshotOf(loadWorkspace()); const key = store.keepRecovery(workspace);
  assert.ok(key); store.stage(workspace); store.discardDraft();
  assert.ok(store.drafts().some((one) => one.key === key));
});


test('invalid DOM drafts survive blur and redraw without changing the model', () => {
  class Input extends EventTarget {
    id = 'amount'; value = '2200'; attributes = new Map(); ownerDocument = { activeElement: null };
    getAttribute(key) { return this.attributes.get(key) || null; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
    setCustomValidity(value) { this.error = value; }
  }
  const input = new Input(); let model = '2200'; let invalid = false;
  const binding = bindNumericInput(input, {
    message: () => 'Invalid amount',
    onInput: (value) => { model = value; }, onSettle: (value) => { model = value; },
    onValidity: (key, value) => { invalid = value; },
  });
  input.value = 'oops'; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('blur'));
  binding.sync(model);
  assert.equal(model, '2200'); assert.equal(input.value, 'oops'); assert.equal(invalid, true);
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  input.value = '2 200 €'; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('blur'));
  binding.sync(model); assert.equal(model, '2 200'); assert.equal(invalid, false);
  input.value = '0'; input.dispatchEvent(new Event('input')); assert.equal(model, '0');
  binding.clear(); assert.equal(input.error, '');
});

test('required term entries do not silently fall back to a different loan duration', () => {
  assert.equal(readNumericInput('', { min: 1, max: 600, integer: true, allowEmpty: false }).valid, false);
  assert.equal(readNumericInput('600', { min: 1, max: 600, integer: true, allowEmpty: false }).valid, true);
  assert.equal(readNumericInput('601', { min: 1, max: 600, integer: true, allowEmpty: false }).valid, false);
});
