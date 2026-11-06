import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanStore, STORE_KEY, STATE_KEY, PROJECTS_KEY, LEGACY_INPUT_KEY } from '../assets/js/store.js';
import { loadWorkspace, snapshotOf } from '../assets/js/state.js';
import { moveOpen, planOf } from '../assets/js/projects.js';
import { createField } from '../assets/js/fields.js';

class MemoryStorage {
  values = new Map();
  fail = null;
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] || null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (key === this.fail) throw new Error('Quota exceeded');
    this.values.set(key, value);
  }
  removeItem(key) { this.values.delete(key); }
}

function serialLock() {
  let queue = Promise.resolve();
  return (work) => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
}

const plan = (id, amount) => ({
  strategies: [{ id: `s-${id}`, name: id, fields: [createField({ id: `f-${id}`, direction: 'income', amount })] }],
  activeId: `s-${id}`, months: 12, milestones: [],
});

function setup() {
  const db = new MemoryStorage();
  const flat = { ...plan('A', '111'), projectId: 'A', tax: '30', inflation: '2', spread: '3' };
  const shelf = { openProjectId: 'A', projects: [{ id: 'A', name: 'A', plan: null }, { id: 'B', name: 'B', plan: plan('B', '999') }] };
  db.setItem(STATE_KEY, JSON.stringify(flat));
  db.setItem(PROJECTS_KEY, JSON.stringify(shelf));
  const withLock = serialLock();
  return { db, make: (tabId) => createPlanStore(() => db, { withLock, tabId }) };
}

function open(snapshot, id) {
  const state = loadWorkspace(snapshot.data);
  const moved = moveOpen(state.projects, state.openProjectId, id, state);
  Object.assign(state, moved.plan, { projects: moved.projects, openProjectId: id });
  return state;
}

const amount = (state) => state.strategies[0].fields[0].amount;
const onShelf = (state, id) => state.projects.find((one) => one.id === id).plan.strategies[0].fields[0].amount;

test('each failed write during a project switch leaves both projects recoverable', async () => {
  for (const failure of [STORE_KEY, PROJECTS_KEY, STATE_KEY]) {
    const { db, make } = setup();
    const store = make('tab');
    const initial = store.read();
    const state = open(initial, 'B');
    store.stage(snapshotOf(state));
    db.fail = failure;
    const saved = await store.save(snapshotOf(state), initial.token);
    const reloaded = loadWorkspace(make('reload').read().data);
    if (failure === STORE_KEY) {
      assert.equal(saved.status, 'error');
      assert.equal(reloaded.openProjectId, 'A');
      assert.equal(amount(reloaded), '111');
      assert.equal(onShelf(reloaded, 'B'), '999');
      assert.equal(store.drafts()[0].snapshot.flat.projectId, 'B');
    } else {
      assert.equal(saved.status, 'saved');
      assert.equal(reloaded.openProjectId, 'B');
      assert.equal(amount(reloaded), '999');
      assert.equal(onShelf(reloaded, 'A'), '111');
    }
  }
});

test('a saved stamp takes precedence over a stale shelf pointer', () => {
  const { db, make } = setup();
  const shelf = JSON.parse(db.getItem(PROJECTS_KEY));
  shelf.openProjectId = 'B';
  db.setItem(PROJECTS_KEY, JSON.stringify(shelf));
  const state = loadWorkspace(make('tab').read().data);
  assert.equal(state.openProjectId, 'A');
  assert.equal(amount(state), '111');
  assert.equal(onShelf(state, 'B'), '999');
});

test('two queued saves from the same revision cannot silently overwrite each other', async () => {
  const { make } = setup();
  const a = make('a'); const b = make('b');
  const aRead = a.read(); const bRead = b.read();
  const aState = loadWorkspace(aRead.data); const bState = loadWorkspace(bRead.data);
  aState.strategies[0].fields[0].amount = '2000';
  bState.strategies[0].fields[0].amount = '3000';
  a.stage(snapshotOf(aState)); b.stage(snapshotOf(bState));
  const [first, second] = await Promise.all([
    a.save(snapshotOf(aState), aRead.token), b.save(snapshotOf(bState), bRead.token),
  ]);
  assert.equal(first.status, 'saved');
  assert.equal(second.status, 'conflict');
  assert.equal(amount(loadWorkspace(b.read().data)), '2000');
  assert.equal(b.drafts()[0].snapshot.flat.strategies[0].fields[0].amount, '3000');
});

test('an ignored foreign event is still caught when the stale tab next saves', async () => {
  const { make } = setup();
  const a = make('a'); const b = make('b');
  const old = a.read();
  const state = loadWorkspace(b.read().data);
  state.strategies[0].fields[0].amount = '2000';
  assert.equal((await b.save(snapshotOf(state), b.read().token)).status, 'saved');
  assert.equal((await a.save(snapshotOf(loadWorkspace(old.data)), old.token)).status, 'conflict');
  assert.equal(amount(loadWorkspace(a.read().data)), '2000');
});

test('a draft staged while a save is queued is not deleted by the older save', async () => {
  const { db } = setup();
  let enter;
  const withLock = (work) => new Promise((resolve) => { enter = () => resolve(work()); });
  const store = createPlanStore(() => db, { withLock, tabId: 'draft' });
  const initial = store.read();
  const first = snapshotOf(loadWorkspace(initial.data));
  store.stage(first);
  const saving = store.save(first, initial.token);
  const newer = structuredClone(first);
  newer.flat.strategies[0].fields[0].amount = '222';
  store.stage(newer);
  enter();
  assert.equal((await saving).status, 'saved');
  assert.equal(store.drafts()[0].snapshot.flat.strategies[0].fields[0].amount, '222');
});

test('closing before a lock is granted leaves a complete persistent recovery draft', () => {
  const { make } = setup();
  const tab = make('closed');
  const state = open(tab.read(), 'B');
  state.strategies[0].fields[0].amount = '1234';
  assert.equal(tab.stage(snapshotOf(state)), true);
  const recovery = make('new-tab').drafts()[0];
  const recovered = loadWorkspace(recovery.snapshot);
  assert.equal(amount(recovered), '1234');
  assert.equal(onShelf(recovered, 'A'), '111');
});

test('a legacy writer can edit the active project without losing shelved work', async () => {
  const { db, make } = setup();
  const store = make('new');
  const initial = store.read();
  const state = open(initial, 'B');
  await store.save(snapshotOf(state), initial.token);
  const legacy = JSON.parse(db.getItem(STATE_KEY));
  delete legacy.projectId;
  legacy.strategies[0].fields[0].amount = '888';
  db.setItem(STATE_KEY, JSON.stringify(legacy));
  const reloaded = loadWorkspace(store.read().data);
  assert.equal(reloaded.openProjectId, 'B');
  assert.equal(amount(reloaded), '888');
  assert.equal(onShelf(reloaded, 'A'), '111');
});

test('adopting a stamped legacy edit to a different project parks the canonical active plan', async () => {
  const { db, make } = setup();
  const store = make('tab');
  const before = store.read();
  await store.save(snapshotOf(open(before, 'B')), before.token);
  db.setItem(STATE_KEY, JSON.stringify({ ...plan('A', '222'), projectId: 'A' }));
  const adopted = loadWorkspace(store.read().data);
  assert.equal(adopted.openProjectId, 'A');
  assert.equal(amount(adopted), '222');
  assert.equal(onShelf(adopted, 'B'), '999');
});

test('legacy migration retires its source only after an authoritative save succeeds', async () => {
  const { db, make } = setup();
  db.removeItem(STATE_KEY); db.removeItem(PROJECTS_KEY);
  db.setItem(LEGACY_INPUT_KEY, JSON.stringify({ income: '42', rent: '12', months: 24 }));
  const store = make('tab'); const initial = store.read();
  const snapshot = snapshotOf(loadWorkspace(initial.data));
  db.fail = STORE_KEY;
  assert.equal((await store.save(snapshot, initial.token)).status, 'error');
  assert.ok(db.getItem(LEGACY_INPUT_KEY));
  db.fail = null;
  assert.equal((await store.save(snapshot, initial.token)).status, 'saved');
  assert.equal(db.getItem(LEGACY_INPUT_KEY), null);
  assert.equal(loadWorkspace(store.read().data).strategies[0].fields[0].amount, '42');
});

test('an unavailable storage or lock never reports a successful save', async () => {
  const { make, db } = setup();
  const snapshot = snapshotOf(loadWorkspace(make('a').read().data));
  const noLock = createPlanStore(() => db);
  assert.equal((await noLock.save(snapshot, noLock.read().token)).status, 'unavailable');
  const blocked = createPlanStore(() => { throw Error('Blocked'); }, { withLock: serialLock() });
  assert.equal(blocked.stage(snapshot), false);
  assert.equal((await blocked.save(snapshot, blocked.read().token)).status, 'error');
});

test('malformed legacy mirrors cannot crash or replace an intact atomic workspace', async () => {
  const { db, make } = setup();
  const store = make('tab');
  const before = store.read();
  assert.equal((await store.save(snapshotOf(open(before, 'B')), before.token)).status, 'saved');
  db.setItem(STATE_KEY, JSON.stringify({ strategies: {} }));
  db.setItem(PROJECTS_KEY, JSON.stringify({ projects: {} }));
  const loaded = loadWorkspace(store.read().data);
  assert.equal(loaded.openProjectId, 'B');
  assert.equal(amount(loaded), '999');
  assert.equal(onShelf(loaded, 'A'), '111');
});

test('independent documents stage separate drafts without a session-storage identity', () => {
  const { db, make } = setup();
  const first = createPlanStore(() => db);
  const second = createPlanStore(() => db);
  const a = snapshotOf(loadWorkspace(make('base').read().data));
  const b = structuredClone(a);
  a.flat.strategies[0].fields[0].amount = '222';
  b.flat.strategies[0].fields[0].amount = '333';
  first.stage(a); second.stage(b);
  assert.deepEqual(new Set(first.drafts().map((one) => one.snapshot.flat.strategies[0].fields[0].amount)), new Set(['222', '333']));
});
