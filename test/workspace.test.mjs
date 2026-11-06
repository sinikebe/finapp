import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS, NAVIGATION_KEY, layoutOf, stepOf, navigationOf, createWorkspaceNavigation, editScenarioAmount, annualKmOf, changeAnnualKm, comparisonReading } from '../assets/js/workspace.js';
import { buildCarEnergy, monthlyCarEnergy, CAR_ENERGY } from '../assets/js/car-energy.js';
import { createScenarioRunner } from '../assets/js/scenarios.js';
import { loadWorkspace, snapshotOf } from '../assets/js/state.js';
import { normalizePlan } from '../assets/js/projects.js';
import { projectCoerce } from '../assets/js/state.js';
import { makeTranslator } from '../assets/js/i18n.js';
import { createField } from '../assets/js/fields.js';
import { remember, takeBack } from '../assets/js/history.js';
import { resultsCsv, csvCell, saveFile } from '../assets/js/browser-tools.js';

const carState = () => ({ ...loadWorkspace(), ...normalizePlan(buildCarEnergy(), projectCoerce) });
const runs = (state) => { const runner = createScenarioRunner(state); return state.strategies.map((one) => runner.run(one.fields)); };

test('returning to the open project restores its section and guided step without touching project data', () => {
  const state = carState(); const before = snapshotOf(state);
  const stored = new Map();
  const prefs = { read: (key, fallback) => stored.get(key) ?? fallback, write: (key, value) => { stored.set(key, structuredClone(value)); return true; } };
  const first = createWorkspaceNavigation(prefs);
  first.remember(state.openProjectId, { section: 'data', step: 1, fields: state.strategies });
  assert.deepEqual(stored.get(NAVIGATION_KEY), { projectId: state.openProjectId, section: 'data', step: 1 });
  const returned = createWorkspaceNavigation(prefs);
  assert.deepEqual(returned.forProject(state.openProjectId), { section: 'data', step: 1 });
  assert.deepEqual(returned.forProject('another-project'), { section: 'overview', step: 0 });
  returned.remember('another-project', { section: 'compare', step: 2 });
  assert.deepEqual(returned.forProject(state.openProjectId), { section: 'data', step: 1 });
  assert.deepEqual(snapshotOf(state), before);
});

test('invalid navigation preferences fall back safely and unavailable storage keeps navigation usable', () => {
  for (const value of [null, 'corrupt', [], { section: 'https://example.org/', step: '2' }]) {
    assert.deepEqual(navigationOf(value), { section: 'overview', step: 0 });
  }
  for (const section of ['overview', 'compare', 'data', 'assumptions']) {
    assert.deepEqual(navigationOf({ section, step: 99 }), { section, step: 2 });
  }
  const navigation = createWorkspaceNavigation({ read: () => ({ projectId: {}, section: 'data', step: 1 }), write: () => false });
  assert.deepEqual(navigation.forProject('project'), { section: 'overview', step: 0 });
  assert.equal(navigation.remember('project', { section: 'assumptions', step: 1 }), false);
  assert.deepEqual(navigation.forProject('project'), { section: 'assumptions', step: 1 });
});

test('all three presentation choices leave complete project snapshots and projections unchanged', () => {
  const state = loadWorkspace();
  const snapshot = snapshotOf(state); const totals = runs(state).map((run) => run.totals);
  for (const value of [...LAYOUTS, 'missing', null, 'parcours', 'horizon']) {
    assert.ok(LAYOUTS.includes(layoutOf(value)));
    assert.deepEqual(snapshotOf(state), snapshot);
    assert.deepEqual(runs(state).map((run) => run.totals), totals);
  }
  assert.equal(layoutOf('missing'), 'horizon');
  assert.deepEqual([-1, 0, 1, 2, 9, 1.5, NaN].map(stepOf), [0, 0, 1, 2, 2, 0, 0]);
});

test('editing an inactive Atelier card respects common identities and never selects it', () => {
  const state = carState(); const original = structuredClone(state.strategies);
  const diesel = state.strategies[1];
  const shared = diesel.fields.find((field) => field.synced);
  const activeId = state.activeId;
  state.strategies = editScenarioAmount(state.strategies, diesel.id, shared.id, '85 €');
  assert.equal(state.activeId, activeId);
  assert.ok(state.strategies.every((one) => one.fields.find((field) => field.id === shared.id).amount === '85'));
  assert.deepEqual(original[0].fields.find((field) => field.id === shared.id).amount, '70');
  const before = runs({ ...state, strategies: original }); const after = runs(state);
  after.forEach((run, index) => assert.ok(Math.abs(run.totals.expenses - before[index].totals.expenses - 900) < .001));
});

test('independent amount edits retain conditional references, schedules and every other scenario', () => {
  const state = carState(); const original = structuredClone(state.strategies);
  const owner = state.strategies[1]; const field = owner.fields[0];
  const edited = editScenarioAmount(state.strategies, owner.id, field.id, '36 000,50');
  assert.equal(edited[1].fields[0].amount, '36 000,50');
  assert.deepEqual({ ...edited[1].fields[0], amount: field.amount }, field);
  for (const index of [0, 2, 3]) assert.deepEqual(edited[index], original[index]);
  for (const value of ['not a number', '-1', 'Infinity', '100000000001']) assert.equal(editScenarioAmount(state.strategies, owner.id, field.id, value), state.strategies);
  assert.equal(editScenarioAmount(state.strategies, 'missing', field.id, '5'), state.strategies);
  assert.equal(editScenarioAmount(state.strategies, owner.id, 'missing', '5'), state.strategies);
});

test('a grouped edit can be undone to the complete original plan', () => {
  const state = carState(); const original = structuredClone(state.strategies);
  const stack = remember([], 'edit', state, state.openProjectId);
  const field = state.strategies[0].fields[0];
  state.strategies = editScenarioAmount(state.strategies, state.activeId, field.id, '100');
  const taken = takeBack(stack, state.openProjectId, () => true);
  assert.ok(taken);
  assert.deepEqual(taken.snapshot.plan.strategies, original);
});

test('mileage changes only energy budgets and is inferred again from current financial amounts', () => {
  const state = carState(); const original = structuredClone(state.strategies);
  assert.equal(annualKmOf(state.strategies), 15000);
  const next = changeAnnualKm(state.strategies, '25 000');
  assert.equal(annualKmOf(next), 25000);
  next.forEach((strategy, index) => {
    const energy = strategy.fields.find((field) => field.labelKey === 'field.default.carEnergy');
    assert.equal(Number(energy.amount), monthlyCarEnergy(CAR_ENERGY.variants[index], 25000));
    assert.deepEqual(strategy.fields.filter((field) => field.id !== energy.id), original[index].fields.filter((field) => field.id !== energy.id));
  });
  const field = next[0].fields.find((one) => one.labelKey === 'field.default.carEnergy');
  const custom = editScenarioAmount(next, next[0].id, field.id, '180');
  assert.equal(annualKmOf(custom), null);
  assert.equal(annualKmOf(changeAnnualKm(custom, '15000')), 15000);
  for (const km of [0, 12345, 12750, 199999]) assert.equal(annualKmOf(changeAnnualKm(custom, String(km))), km);
  for (const value of ['', '-1', '1000.5', '200001', 'bad']) assert.equal(changeAnnualKm(next, value), next);
});

test('car comparison uses the complete model cost; financed or personal plans retain cash metrics', () => {
  const state = carState(); const projections = runs(state);
  const reading = comparisonReading(state.strategies, projections);
  assert.equal(reading.car, true);
  assert.deepEqual(reading.values, projections.map((run) => -run.totals.worth));
  assert.equal(reading.values[3], reading.best);
  state.strategies[0].fields.push(createField({ direction: 'income', amount: '100' }));
  const withIncome = runs(state);
  assert.equal(comparisonReading(state.strategies, withIncome).car, false);
  assert.deepEqual(comparisonReading(state.strategies, withIncome).values, withIncome.map((run) => run.totals.net));
  const personal = loadWorkspace();
  assert.deepEqual(comparisonReading(personal.strategies, runs(personal), 'worth').values, runs(personal).map((run) => run.totals.worth));
});

test('CSV exports all scenarios, quoted labels and signed actual model values', () => {
  const state = carState(); state.strategies[0].name = '=HYPERLINK("example")';
  const csv = resultsCsv(state, runs(state), makeTranslator('fr'));
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.equal(csv.trim().split('\r\n').length, 5);
  assert.ok(csv.includes('"\'=HYPERLINK(""example"")"'));
  assert.ok(csv.includes(';60;0;'));
  assert.ok(csv.includes(';-' ));
  assert.equal(csvCell(-500.25), '-500.25');
  for (const value of ['=1+1', '+SUM(A1)', '-1+2', '@cmd', '\tdata']) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('a;"b"\nc'), '"a;""b""\nc"');
});

function downloadHost(picker) {
  const calls = []; const link = { click() { calls.push('download'); }, remove() {} };
  return { calls, host: { showSaveFilePicker: picker,
    URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
    document: { createElement() { return link; }, body: { appendChild() {} } }, setTimeout() {},
  } };
}

test('native file save cancellation never triggers a fallback download', async () => {
  const abort = Object.assign(new Error('Cancelled'), { name: 'AbortError' });
  const { host, calls } = downloadHost(async () => { throw abort; });
  assert.equal(await saveFile('{}', 'backup.json', 'application/json', host), 'cancelled');
  assert.deepEqual(calls, []);
});

test('unsupported or rejected file pickers still download a usable backup', async () => {
  for (const picker of [undefined, async () => { throw Error('Permission'); }]) {
    const { host, calls } = downloadHost(picker);
    assert.equal(await saveFile('{}', 'backup.json', 'application/json', host), 'downloaded');
    assert.deepEqual(calls, ['download']);
  }
});

test('Download bypasses the optional native picker, even when the browser supports it', async () => {
  let picked = false;
  const { host, calls } = downloadHost(async () => { picked = true; });
  assert.equal(await saveFile('{}', 'backup.json', 'application/json', host, { native: false }), 'downloaded');
  assert.equal(picked, false); assert.deepEqual(calls, ['download']);
});

test('native saving writes and closes the selected file, and a failed write aborts then downloads', async () => {
  const saved = []; const successful = downloadHost(async () => ({ createWritable: async () => ({ write: async (text) => saved.push(text), close: async () => saved.push('closed') }) }));
  assert.equal(await saveFile('{"complete":true}', 'backup.json', 'application/json', successful.host), 'saved');
  assert.deepEqual(saved, ['{"complete":true}', 'closed']); assert.deepEqual(successful.calls, []);
  let aborted = false;
  const failure = downloadHost(async () => ({ createWritable: async () => ({ write: async () => { throw Error('Disk full'); }, abort: async () => { aborted = true; } }) }));
  assert.equal(await saveFile('{}', 'backup.json', 'application/json', failure.host), 'downloaded');
  assert.equal(aborted, true); assert.deepEqual(failure.calls, ['download']);
});
