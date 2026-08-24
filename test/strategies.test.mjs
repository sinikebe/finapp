import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_STRATEGIES, MAX_NAME_LENGTH,
  createStrategy, normalizeStrategy, normalizeStrategies, nameOf, activeIdOf,
  addStrategy, updateStrategy, duplicateStrategy, removeStrategy, neighbourOf,
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
