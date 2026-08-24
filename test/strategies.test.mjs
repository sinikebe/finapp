import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_STRATEGIES, MAX_NAME_LENGTH,
  createStrategy, normalizeStrategy, normalizeStrategies, nameOf, activeIdOf,
  addStrategy, updateStrategy, duplicateStrategy, removeStrategy, neighbourOf,
  spreadField, unlinkField, removeEverywhere,
  migrateFields,
} from '../assets/js/strategies.js';
import { createField, labelOf } from '../assets/js/fields.js';

const t = (key, position) => (key === 'strategy.defaultName' ? `Strategy ${position}` : key);
const copyName = (name) => `${name} (copy)`;
const someFields = () => [
  createField({ direction: 'income', amount: '3000', label: 'Salary' }),
  createField({ direction: 'expense', amount: '1200', label: 'Rent' }),
];

test('a strategy is a name and a set of fields', () => {
  const strategy = createStrategy({ name: 'Baseline', fields: someFields() });
  assert.ok(strategy.id);
  assert.equal(strategy.name, 'Baseline');
  assert.equal(strategy.fields.length, 2);
});

test('anything can be coerced into a strategy', () => {
  assert.deepEqual(normalizeStrategy(null).fields, []);
  assert.equal(normalizeStrategy({ name: 42 }).name, '');
  assert.equal(normalizeStrategy({ name: '  Plan B  ' }).name, 'Plan B');
  assert.equal(normalizeStrategy({ name: 'x'.repeat(200) }).name.length, MAX_NAME_LENGTH);
  assert.deepEqual(normalizeStrategy({ fields: 'nope' }).fields, []);
  assert.ok(normalizeStrategy({}).id);
});

test('there is always at least one strategy, with unique ids', () => {
  assert.equal(normalizeStrategies([]).length, 1);
  assert.equal(normalizeStrategies(null).length, 1);
  assert.equal(normalizeStrategies('nope').length, 1);
  const clashing = normalizeStrategies([{ id: 'same' }, { id: 'same' }]);
  assert.equal(new Set(clashing.map((s) => s.id)).size, 2);
  assert.equal(normalizeStrategies(Array.from({ length: 20 }, () => ({}))).length, MAX_STRATEGIES);
});

test('an unnamed strategy is known by its position, in the reader\'s language', () => {
  const list = [createStrategy({}), createStrategy({ name: 'Plan B' })];
  assert.equal(nameOf(list[0], 0, t), 'Strategy 1');
  assert.equal(nameOf(list[1], 1, t), 'Plan B', 'a name of its own wins');
  assert.equal(nameOf(list[0], 3, t), 'Strategy 4', 'the position is where it sits now');
});

test('adding is bounded, and the list never empties', () => {
  let list = [createStrategy({})];
  for (let i = 0; i < 10; i += 1) list = addStrategy(list);
  assert.equal(list.length, MAX_STRATEGIES);

  const single = [createStrategy({})];
  assert.equal(removeStrategy(single, single[0].id).length, 1, 'the last one stays');
});

test('a copy is a separate world: same numbers, its own fields', () => {
  const list = [createStrategy({ name: 'Baseline', fields: someFields() })];
  const next = duplicateStrategy(list, list[0].id, copyName, t);
  assert.equal(next.length, 2);
  assert.equal(next[1].name, 'Baseline (copy)');
  assert.deepEqual(
    next[1].fields.map((f) => [labelOf(f, t), f.amount]),
    next[0].fields.map((f) => [labelOf(f, t), f.amount]),
    'the numbers come along',
  );
  for (const field of next[1].fields) {
    assert.ok(!next[0].fields.some((original) => original.id === field.id), 'but not the field ids');
  }
});

test('editing one strategy cannot reach into another', () => {
  const start = [createStrategy({ name: 'A', fields: someFields() })];
  const two = duplicateStrategy(start, start[0].id, copyName, t);
  const edited = updateStrategy(two, two[1].id, {
    fields: two[1].fields.map((field) => ({ ...field, amount: '999' })),
  });
  assert.deepEqual(edited[0].fields.map((f) => f.amount), ['3000', '1200']);
  assert.deepEqual(edited[1].fields.map((f) => f.amount), ['999', '999']);
});

test('a copy of an unnamed strategy stays unnamed', () => {
  const list = [createStrategy({ fields: someFields() })];
  const next = duplicateStrategy(list, list[0].id, copyName, t);
  assert.equal(next[1].name, '', 'it simply takes the next position');
  assert.equal(nameOf(next[1], 1, t), 'Strategy 2');
});

test('the active strategy always exists', () => {
  const list = [createStrategy({}), createStrategy({})];
  assert.equal(activeIdOf(list, list[1].id), list[1].id);
  assert.equal(activeIdOf(list, 'gone'), list[0].id, 'a stale id falls back to the first');
  assert.equal(activeIdOf(list, undefined), list[0].id);
});

test('removing hands over to a neighbour', () => {
  const list = [createStrategy({}), createStrategy({}), createStrategy({})];
  assert.equal(neighbourOf(list, list[0].id), list[1].id);
  assert.equal(neighbourOf(list, list[2].id), list[1].id);
  assert.equal(neighbourOf(list, 'gone'), list[0].id);
});

test('operations never mutate what they are given', () => {
  const list = [createStrategy({ name: 'A', fields: someFields() })];
  const snapshot = JSON.stringify(list);
  addStrategy(list);
  updateStrategy(list, list[0].id, { name: 'B' });
  duplicateStrategy(list, list[0].id, copyName, t);
  removeStrategy(list, list[0].id);
  assert.equal(JSON.stringify(list), snapshot);
});

test('a store from before strategies becomes one unnamed strategy', () => {
  const migrated = migrateFields(someFields());
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].name, '');
  assert.equal(migrated[0].fields.length, 2);
  assert.equal(nameOf(migrated[0], 0, t), 'Strategy 1');
});

/* ------------------------------------------------------- syncing a field */

const wage = (amount, extra = {}) => createField({
  direction: 'income', labelKey: 'field.income', amount, ...extra,
});
const rent = (amount) => createField({ direction: 'expense', labelKey: 'field.rent', amount });
const fieldsOf = (strategies, index) => strategies[index].fields;
const named = (strategy, key) => strategy.fields.find((f) => f.labelKey === key);

test('syncing finds the counterpart by name the first time', () => {
  // Two strategies built the old way: the same field, different ids.
  const before = normalizeStrategies([
    { fields: [wage('4000'), rent('1200')] },
    { fields: [wage('4000'), rent('1800')] },
  ]);
  assert.notEqual(fieldsOf(before, 0)[0].id, fieldsOf(before, 1)[0].id, 'ids differ to begin with');

  const after = spreadField(before, { ...fieldsOf(before, 0)[0], synced: true, amount: '4500' });
  assert.equal(named(after[1], 'field.income').amount, '4500', 'the other strategy followed');
  assert.equal(named(after[1], 'field.income').id, fieldsOf(before, 0)[0].id, 'and now shares its id');
  assert.equal(named(after[1], 'field.rent').amount, '1800', 'its own fields are untouched');
  assert.equal(after[1].fields.length, 2, 'nothing was added');
});

test('once synced, the link is by id and a rename travels with it', () => {
  const base = normalizeStrategies([
    { fields: [wage('4000')] },
    { fields: [wage('4000')] },
  ]);
  // The first spread is what aligns the ids; everything after goes by id, so a
  // rename cannot break the link the way matching on the name would.
  const linked = spreadField(base, { ...fieldsOf(base, 0)[0], synced: true });
  assert.equal(fieldsOf(linked, 1)[0].id, fieldsOf(linked, 0)[0].id);

  const renamed = spreadField(linked, { ...fieldsOf(linked, 0)[0], label: 'Salary', amount: '5000' });
  assert.equal(renamed[1].fields[0].label, 'Salary', 'the new name travelled');
  assert.equal(renamed[1].fields[0].amount, '5000');
  assert.equal(renamed[1].fields.length, 1, 'and did not become a second field');
});

test('a strategy with no counterpart gains the field', () => {
  const before = normalizeStrategies([
    { fields: [wage('4000')] },
    { fields: [rent('900')] },
  ]);
  const after = spreadField(before, { ...fieldsOf(before, 0)[0], synced: true });
  assert.equal(after[1].fields.length, 2, 'a synced field exists everywhere by definition');
  assert.equal(named(after[1], 'field.income').amount, '4000');
});

test('syncing never steals a field already following something else', () => {
  const before = normalizeStrategies([
    { fields: [wage('4000'), wage('500')] },
    { fields: [wage('4000', { synced: true })] },
  ]);
  // The second strategy's only income is already synced to something, so the
  // new one must not adopt it — it gets appended instead.
  const after = spreadField(before, { ...fieldsOf(before, 0)[1], synced: true });
  assert.equal(after[1].fields.length, 2);
  assert.equal(after[1].fields[0].amount, '4000', 'the field already linked was left alone');
});

test('unsyncing leaves every copy where it stands', () => {
  const linked = spreadField(normalizeStrategies([
    { fields: [wage('4000')] },
    { fields: [wage('4000')] },
  ]), { ...wage('4000'), synced: true });
  const id = linked[0].fields[0].id;
  const apart = unlinkField(linked, id);
  assert.equal(apart[0].fields[0].synced, false);
  assert.equal(apart[1].fields[0].synced, false);
  assert.equal(apart[1].fields[0].amount, '4000', 'they keep what they had');
});

test('removing a synced field removes it everywhere', () => {
  const linked = spreadField(normalizeStrategies([
    { fields: [wage('4000'), rent('1200')] },
    { fields: [wage('4000'), rent('1800')] },
  ]), { ...wage('4000'), synced: true });
  const id = linked[0].fields.find((f) => f.labelKey === 'field.income').id;
  const gone = removeEverywhere(linked, id);
  for (const strategy of gone) {
    assert.equal(strategy.fields.some((f) => f.id === id), false);
    assert.equal(strategy.fields.length, 1, 'only that one went');
  }
});

test('duplicating a strategy keeps synced ids and renews the rest', () => {
  const linked = spreadField(normalizeStrategies([
    { fields: [wage('4000'), rent('1200')] },
  ]), { ...wage('4000'), synced: true });
  const copied = duplicateStrategy(linked, linked[0].id, (name) => `Copy of ${name}`, t);
  const source = copied[0].fields;
  const copy = copied[1].fields;
  assert.equal(copy.find((f) => f.synced).id, source.find((f) => f.synced).id, 'the link survives');
  const ownRent = copy.find((f) => f.labelKey === 'field.rent');
  const sourceRent = source.find((f) => f.labelKey === 'field.rent');
  assert.notEqual(ownRent.id, sourceRent.id, 'an unsynced field is its own again');
});

test('sync operations never mutate what they are given', () => {
  const before = normalizeStrategies([{ fields: [wage('4000')] }, { fields: [wage('4000')] }]);
  const snapshot = JSON.stringify(before);
  spreadField(before, { ...before[0].fields[0], synced: true, amount: '9' });
  unlinkField(before, before[0].fields[0].id);
  removeEverywhere(before, before[0].fields[0].id);
  assert.equal(JSON.stringify(before), snapshot);
});
