import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkspace } from '../assets/js/backup.js';
import { createField } from '../assets/js/fields.js';
import { loadWorkspace, snapshotOf } from '../assets/js/state.js';
import { BackupMergeError, compareBackups, mergeBackups, compareWorkspaces, mergeWorkspaces } from '../assets/js/backup-merge.js';

const plan = (id, amount) => ({
  strategies: [{ id: `s-${id}`, name: `Synthetic ${id}`, fields: [createField({ id: `f-${id}`, label: 'Synthetic salary', direction: 'income', amount })] }],
  activeId: `s-${id}`, months: 36, milestones: [],
});
function workspace() {
  const state = loadWorkspace();
  Object.assign(state, plan('a', '100'), {
    openProjectId: 'a',
    projects: [{ id: 'a', name: 'Synthetic budget', plan: null }, { id: 'b', name: 'Synthetic future', plan: plan('b', '200') }],
  });
  return validateWorkspace(snapshotOf(state));
}

test('independent project and assumption changes appear only in the differences, with stable bilingual labels', () => {
  const original = workspace();
  const local = structuredClone(original), remote = structuredClone(original);
  local.flat.strategies[0].fields[0].amount = '125';
  remote.shelf.projects[1].plan.strategies[0].fields[0].amount = '250';
  const comparison = compareBackups(local, remote);
  assert.equal(comparison.differences.length, 2);
  assert.equal(comparison.differences.every((change) => change.conflict), true);
  assert.ok(comparison.differences.some((change) => change.labels.fr.includes('Projet « Synthetic budget »')));
  assert.ok(comparison.differences.some((change) => change.labels.fr.includes('Montant')));
  const choices = Object.fromEntries(comparison.differences.map((change) => [change.id, change.local === '125' ? 'local' : 'remote']));
  const merged = mergeBackups(comparison, choices);
  assert.equal(merged.flat.strategies[0].fields[0].amount, '125');
  assert.equal(merged.shelf.projects[1].plan.strategies[0].fields[0].amount, '250');
  assert.deepEqual(local, { ...original, flat: { ...original.flat, strategies: local.flat.strategies } });
  assert.equal(remote.flat.strategies[0].fields[0].amount, '100');
});

test('two versions with the same field changed require a choice and never mutate either source', () => {
  const local = workspace(), remote = structuredClone(local);
  local.flat.strategies[0].fields[0].amount = '150';
  remote.flat.strategies[0].fields[0].amount = '300';
  const beforeLocal = structuredClone(local), beforeRemote = structuredClone(remote);
  const comparison = compareWorkspaces(local, remote);
  assert.equal(comparison.differences.length, 1);
  const [change] = comparison.differences;
  assert.equal(change.conflict, true);
  assert.match(change.label, /Amount/);
  assert.throws(() => mergeWorkspaces(comparison), (error) => error instanceof BackupMergeError && error.code === 'choices');
  assert.equal(mergeWorkspaces(comparison, { [change.id]: 'local' }).flat.strategies[0].fields[0].amount, '150');
  assert.equal(mergeWorkspaces(comparison, { [change.id]: 'remote' }).flat.strategies[0].fields[0].amount, '300');
  assert.deepEqual(local, beforeLocal);
  assert.deepEqual(remote, beforeRemote);
});

test('projects and fields present on only one side are retained, while the open plan remains unique', () => {
  const local = workspace(), remote = structuredClone(local);
  local.flat.strategies[0].fields.push(createField({ id: 'local-field', label: 'Synthetic rent', direction: 'expense', amount: '40' }));
  remote.shelf.projects.push({ id: 'c', name: 'Synthetic third', plan: plan('c', '300') });
  remote.shelf.projects[1].plan.strategies[0].fields.push(createField({ id: 'remote-field', label: 'Synthetic investment', direction: 'expense', amount: '20' }));
  const comparison = compareBackups(local, remote);
  assert.equal(comparison.differences.every((change) => !change.conflict), true);
  const merged = mergeBackups(comparison);
  assert.deepEqual(merged.shelf.projects.map((p) => p.id), ['a', 'b', 'c']);
  assert.ok(merged.flat.strategies[0].fields.some((f) => f.id === 'local-field'));
  assert.ok(merged.shelf.projects[1].plan.strategies[0].fields.some((f) => f.id === 'remote-field'));
  assert.equal(merged.shelf.projects.filter((p) => p.plan === null).length, 1);
  assert.equal(merged.shelf.projects[0].plan, null);
  assert.deepEqual(validateWorkspace(merged), merged);
});

test('a project absent from either copy is not silently deleted during reconciliation', () => {
  const local = workspace(), remote = structuredClone(local);
  local.shelf.projects.splice(1);
  const comparison = compareBackups(local, remote);
  assert.equal(comparison.differences.length, 1);
  assert.equal(comparison.differences[0].kind, 'onlyRemote');
  const merged = mergeBackups(comparison);
  assert.equal(merged.shelf.projects.length, 2);
  assert.deepEqual(merged.shelf.projects[1], remote.shelf.projects[1]);
});

test('merging too many different projects refuses instead of truncating a project', () => {
  const local = workspace(), remote = workspace();
  local.shelf.projects = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: `Synthetic ${id}`, plan: id === 'a' ? null : plan(id, '20') }));
  remote.shelf.projects = ['a', 'b', 'c', 'd', 'e', 'g'].map((id) => ({ id, name: `Synthetic ${id}`, plan: id === 'a' ? null : plan(id, '20') }));
  const comparison = compareBackups(local, remote);
  assert.throws(() => mergeBackups(comparison), (error) => error instanceof BackupMergeError && error.code === 'tooManyProjects');
});

test('a comparison cannot apply choices to modified input after it was reviewed', () => {
  const comparison = compareBackups(workspace(), workspace());
  comparison.remote.flat.tax = '42';
  assert.throws(() => mergeBackups(comparison), (error) => error instanceof BackupMergeError && error.code === 'changed');
});

test('identical backups merge without creating false differences or changing the original workspace', () => {
  const original = workspace();
  const comparison = compareBackups(original, structuredClone(original));
  assert.deepEqual(comparison.differences, []);
  assert.deepEqual(mergeBackups(comparison), original);
});

test('a changed presentation order is reported and chosen explicitly', () => {
  const local = workspace(), remote = structuredClone(local);
  remote.shelf.projects.reverse();
  const comparison = compareBackups(local, remote);
  const [change] = comparison.differences;
  assert.equal(change.kind, 'order');
  assert.throws(() => mergeBackups(comparison), /choices/);
  const merged = mergeBackups(comparison, { [change.id]: 'remote' });
  assert.deepEqual(merged.shelf.projects.map((one) => one.id), ['b', 'a']);
  assert.equal(merged.flat.projectId, 'a');
});
