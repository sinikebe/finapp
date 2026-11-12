import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBackup } from '../assets/js/backup.js';
import { parseLegacyRescue, parseRestoreText, MAX_LEGACY_RESCUE_BYTES } from '../assets/js/legacy-rescue.js';
import { createPlanStore, STORE_KEY, STATE_KEY, PROJECTS_KEY, LEGACY_FIELDS_KEY, LEGACY_INPUT_KEY } from '../assets/js/store.js';
import { loadWorkspace, snapshotOf } from '../assets/js/state.js';
import { moveOpen, MAX_PROJECTS } from '../assets/js/projects.js';
import { createField, MAX_FIELDS } from '../assets/js/fields.js';

// Fixture shapes come from the old state migrations and store regression tests;
// names and values are synthetic. Raw strings mimic the bridge's exact export.
const rescue = (entries, environment = 'production') => JSON.stringify({
  format: 'finapps-legacy-rescue-v1', app: 'finapp', environment, entries,
});
const candidates = (result) => [result.workspace, ...result.drafts.map((draft) => draft.snapshot)];
function assertRestorable(result) {
  for (const workspace of candidates(result)) {
    assert.doesNotThrow(() => parseBackup(JSON.stringify({ version: 1, workspace, drafts: [] })));
  }
}
const fieldAmounts = (workspace) => workspace.flat.strategies[0].fields.map((field) => field.amount);

test('historical state.v2 fields and inputs.v1 restore as distinct, previewable candidates', () => {
  const fields = { fields: [{ direction: 'income', amount: '2750' }, { direction: 'expense', amount: '980' }], months: 60 };
  const inputs = { income: '3150', rent: '1200', months: 48 };
  const entries = { [LEGACY_FIELDS_KEY]: JSON.stringify(fields), [LEGACY_INPUT_KEY]: JSON.stringify(inputs) };
  const original = rescue(entries);
  const result = parseLegacyRescue(original);
  assert.equal(result.legacyEnvironment, 'production');
  assert.equal(result.exportedAt, '');
  assert.equal(result.drafts.length, 1);
  assert.ok(result.drafts[0].labelKey);
  assertRestorable(result);
  assert.deepEqual(fieldAmounts(result.workspace), ['2750', '980']);
  assert.deepEqual(fieldAmounts(result.drafts[0].snapshot), ['3150', '1200']);
  assert.deepEqual(JSON.parse(original).entries, entries, 'the downloaded original remains byte-identical');
});

test('a profile with only inputs.v1 restores an actual old-value candidate', () => {
  const input = { income: '2750', rent: '980', months: 60 };
  const result = parseLegacyRescue(rescue({ [LEGACY_INPUT_KEY]: JSON.stringify(input) }, 'development'));
  assert.equal(result.legacyEnvironment, 'development');
  assert.equal(result.drafts.length, 0);
  assertRestorable(result);
  assert.equal(result.workspace.flat.months, 60);
  assert.deepEqual(fieldAmounts(result.workspace), ['2750', '980']);
});

test('stamped flat A edited by an older tab restores A and preserves shelved B', () => {
  const plan = (id, amount) => ({
    strategies: [{ id: `strategy-${id}`, fields: [createField({ id: `field-${id}`, direction: 'income', amount })] }],
    activeId: `strategy-${id}`, months: 12, milestones: [],
  });
  const flatA = { ...plan('A', '111'), projectId: 'A', tax: '30', inflation: '2', spread: '3' };
  const shelfA = { openProjectId: 'A', projects: [{ id: 'A', name: 'A', plan: null }, { id: 'B', name: 'B', plan: plan('B', '999') }] };
  const entries = { [STATE_KEY]: JSON.stringify(flatA), [PROJECTS_KEY]: JSON.stringify(shelfA) };
  const store = createPlanStore(() => ({ getItem: (key) => entries[key] ?? null }), { tabId: 'fixture' });
  const initial = loadWorkspace(store.read().data);
  const moved = moveOpen(initial.projects, initial.openProjectId, 'B', initial);
  Object.assign(initial, moved.plan, { projects: moved.projects, openProjectId: 'B' });
  const atomic = { version: 1, revision: 'synthetic-r1', ...snapshotOf(initial), before: { flat: entries[STATE_KEY], shelf: entries[PROJECTS_KEY] } };
  entries[STORE_KEY] = JSON.stringify(atomic);
  entries[STATE_KEY] = JSON.stringify({ ...plan('A', '222'), projectId: 'A', tax: '30', inflation: '2', spread: '3' });
  entries[PROJECTS_KEY] = JSON.stringify(atomic.shelf);
  const original = rescue(entries);

  const result = parseLegacyRescue(original);
  assertRestorable(result);
  assert.equal(result.workspace.flat.projectId, 'A');
  assert.deepEqual(fieldAmounts(result.workspace), ['222']);
  assert.equal(result.workspace.shelf.projects.find((project) => project.id === 'B').plan.strategies[0].fields[0].amount, '999');
  assert.ok(candidates(result).some((workspace) => workspace.flat.projectId === 'B'), 'the old complete atomic copy remains selectable');
  assert.deepEqual(JSON.parse(original).entries, entries);
});

test('flat-only and shelf-only historical profiles remain individually recoverable', () => {
  const seed = snapshotOf(loadWorkspace());
  const flat = { ...seed.flat, months: 72 };
  const flatResult = parseLegacyRescue(rescue({ [STATE_KEY]: JSON.stringify(flat) }));
  assertRestorable(flatResult);
  assert.equal(flatResult.drafts.length, 0, 'a flat-only profile has one clear choice');
  assert.equal(flatResult.workspace.flat.months, 72);

  const shelf = { openProjectId: 'saved-project', projects: [{ id: 'saved-project', name: 'Recovered', plan: {
    strategies: seed.flat.strategies, activeId: seed.flat.activeId, months: 84, milestones: [],
  } }] };
  const shelfResult = parseLegacyRescue(rescue({ [PROJECTS_KEY]: JSON.stringify(shelf) }));
  assertRestorable(shelfResult);
  assert.equal(shelfResult.drafts.length, 0, 'a shelf-only profile has one clear choice');
  assert.equal(shelfResult.workspace.shelf.projects[0].name, 'Recovered');
  assert.equal(shelfResult.workspace.flat.months, 84);
});

test('aligned atomic and mirror copies display a single recovery choice', () => {
  const seed = snapshotOf(loadWorkspace());
  const aligned = parseLegacyRescue(rescue({
    [STORE_KEY]: JSON.stringify({ version: 1, revision: 'same', ...seed }),
    [STATE_KEY]: JSON.stringify(seed.flat),
    [PROJECTS_KEY]: JSON.stringify(seed.shelf),
  }));
  assert.equal(aligned.drafts.length, 0);
  assertRestorable(aligned);
});

test('all historical drafts remain selectable, beyond the regular backup limit of 100', () => {
  const base = snapshotOf(loadWorkspace());
  const entries = {};
  for (let index = 0; index < 103; index += 1) {
    entries[`finapp.draft.v1.synthetic-${index}`] = JSON.stringify({ snapshot: { ...base,
      flat: { ...base.flat, months: index + 1 } }, updatedAt: index });
  }
  const result = parseLegacyRescue(rescue(entries));
  assert.equal(candidates(result).length, 103);
  assert.equal(candidates(result).at(-1).flat.months, 103);
  assertRestorable(result);
});

test('unknown, malformed, and empty rescue files never create default projects', () => {
  const failures = [
    '{not json}',
    JSON.stringify({ format: 'finapps-legacy-rescue-v1', app: 'garapp', environment: 'production', entries: {} }),
    rescue({}),
    rescue({ [LEGACY_FIELDS_KEY]: '{not json}' }),
    rescue({ [LEGACY_FIELDS_KEY]: JSON.stringify({ fields: [null] }) }),
    rescue({ [LEGACY_INPUT_KEY]: JSON.stringify({ income: null, rent: null }) }),
    rescue({ [PROJECTS_KEY]: JSON.stringify({ projects: [{ id: 'only-default' }] }) }),
    rescue({ [LEGACY_INPUT_KEY]: JSON.stringify({ unrelated: 123 }) }),
    rescue({ [STATE_KEY]: JSON.stringify({ unrelated: 123 }) }),
  ];
  for (const raw of failures) assert.throws(() => parseLegacyRescue(raw));
});

test('an explicit old horizon is recoverable without nonempty fields or income', () => {
  const fields = parseLegacyRescue(rescue({ [LEGACY_FIELDS_KEY]: JSON.stringify({ fields: [], months: 60 }) }));
  const inputs = parseLegacyRescue(rescue({ [LEGACY_INPUT_KEY]: JSON.stringify({ months: 72 }) }));
  assert.equal(fields.workspace.flat.months, 60);
  assert.equal(inputs.workspace.flat.months, 72);
  assertRestorable(fields);
  assertRestorable(inputs);
});

test('earlier mirror copies retained inside an atomic backup stay selectable', () => {
  const current = snapshotOf(loadWorkspace());
  const previous = structuredClone(current); previous.flat.months = 48;
  current.flat.months = 120;
  const raw = rescue({ [STORE_KEY]: JSON.stringify({ version: 1, revision: 'synthetic', ...current,
    before: { flat: JSON.stringify(previous.flat), shelf: JSON.stringify(previous.shelf) } }) });
  const parsed = parseLegacyRescue(raw);
  assertRestorable(parsed);
  assert.equal(parsed.workspace.flat.months, 120);
  assert.ok(parsed.drafts.some((choice) => choice.labelKey === 'ui.restoreLegacyPrevious'
    && choice.snapshot.flat.months === 48));
});

test('oversized old collections stay in raw rescue rather than being silently truncated', () => {
  const seed = snapshotOf(loadWorkspace());
  const overfull = { ...seed.shelf, projects: Array.from({ length: MAX_PROJECTS + 1 }, (_, index) => ({
    id: `project-${index}`, name: `Project ${index}`, plan: null,
  })) };
  assert.throws(() => parseLegacyRescue(rescue({ [PROJECTS_KEY]: JSON.stringify(overfull) })));
  const fields = Array.from({ length: MAX_FIELDS + 1 }, (_, index) => ({ direction: 'income', amount: String(index + 1) }));
  assert.throws(() => parseLegacyRescue(rescue({ [LEGACY_FIELDS_KEY]: JSON.stringify({ fields }) })));

  const raw = rescue({
    [STORE_KEY]: JSON.stringify({ version: 1, revision: 'synthetic', ...seed }),
    [STATE_KEY]: JSON.stringify(seed.flat),
    [PROJECTS_KEY]: JSON.stringify(overfull),
  });
  const restored = parseLegacyRescue(raw);
  assertRestorable(restored);
  assert.ok(candidates(restored).every((choice) => choice.shelf.projects.length <= MAX_PROJECTS));
  assert.equal(JSON.parse(JSON.parse(raw).entries[PROJECTS_KEY]).projects.length, MAX_PROJECTS + 1);
});

test('many unrelated rescue keys do not block a real old workspace', () => {
  const entries = Object.fromEntries(Array.from({ length: 2050 }, (_, index) => [`other-${index}`, '{}']));
  entries[LEGACY_INPUT_KEY] = JSON.stringify({ income: '2750', rent: '980', months: 60 });
  const original = rescue(entries);
  assert.deepEqual(fieldAmounts(parseLegacyRescue(original).workspace), ['2750', '980']);
  assert.equal(JSON.parse(original).entries['other-2049'], '{}');
});

test('restore UI accepts the old rescue without weakening ordinary backup limits or safety', () => {
  const ordinary = JSON.stringify({ version: 1, workspace: snapshotOf(loadWorkspace()) });
  assert.equal(parseRestoreText(ordinary).legacyEnvironment, undefined);
  const old = rescue({ [LEGACY_INPUT_KEY]: JSON.stringify({ income: '2750', rent: '980', months: 60 }) });
  assert.equal(parseRestoreText(old).legacyEnvironment, 'production');
  assert.throws(() => parseRestoreText(JSON.stringify({ version: 99, workspace: {} })), { code: 'version' });
  assert.throws(() => parseLegacyRescue(' '.repeat(MAX_LEGACY_RESCUE_BYTES + 1)), { code: 'tooLarge' });
  const interfaceView = readFileSync(new URL('../assets/js/interface-view.js', import.meta.url), 'utf8');
  assert.match(interfaceView, /offered = parseRestoreText\(text\)/);
  assert.match(interfaceView, /store\.keepRecovery\(snapshotOf\(state\)\)/);
  assert.match(interfaceView, /saver\.replace\(source\)/);
});
