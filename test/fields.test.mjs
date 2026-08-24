import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIRECTIONS, FIELD_SHAPE, MAX_FIELDS, MAX_LABEL_LENGTH,
  createField, normalizeField, normalizeFields, labelOf,
  addField, updateField, duplicateField, removeField, neighbourOf,
  defaultFields, migrateLegacyInputs,
} from '../assets/js/fields.js';

const t = (key) => ({ 'field.default.income': 'Income', 'field.default.rent': 'Rent' }[key] || key);
const copyName = (name) => `${name} (copy)`;

test('a new field is complete, identified, and an expense unless told otherwise', () => {
  const field = createField();
  assert.deepEqual(Object.keys(field).sort(), Object.keys(FIELD_SHAPE).sort());
  assert.ok(field.id);
  assert.equal(field.direction, 'expense');
  assert.equal(field.amount, '');
});

test('ids are unique across many fields', () => {
  const ids = new Set(Array.from({ length: 200 }, () => createField().id));
  assert.equal(ids.size, 200);
});

test('anything can be coerced into a field', () => {
  assert.equal(normalizeField(null).direction, 'expense');
  assert.equal(normalizeField({ direction: 'sideways' }).direction, 'expense');
  assert.equal(normalizeField({ direction: 'income' }).direction, 'income');
  assert.equal(normalizeField({ label: 42 }).label, '');
  assert.equal(normalizeField({ label: '  Rent  ' }).label, 'Rent');
  assert.equal(normalizeField({ label: 'x'.repeat(500) }).label.length, MAX_LABEL_LENGTH);
  assert.equal(normalizeField({ amount: 1200 }).amount, '1200');
  assert.equal(normalizeField({ amount: {} }).amount, '');
  assert.ok(normalizeField({ id: '' }).id);
});

test('a list is bounded and free of duplicate ids', () => {
  assert.deepEqual(normalizeFields('nope'), []);
  assert.deepEqual(normalizeFields(null), []);
  const clashing = normalizeFields([{ id: 'same' }, { id: 'same' }, { id: 'same' }]);
  assert.equal(new Set(clashing.map((f) => f.id)).size, 3);
  assert.equal(normalizeFields(Array.from({ length: MAX_FIELDS + 40 }, () => ({}))).length, MAX_FIELDS);
});

test('a field is named by the reader, then by the dictionary, then not at all', () => {
  assert.equal(labelOf(createField({ label: 'Side gig', labelKey: 'field.default.income' }), t), 'Side gig');
  assert.equal(labelOf(createField({ labelKey: 'field.default.rent' }), t), 'Rent');
  assert.equal(labelOf(createField(), t), '');
});

test('adding a field continues what the reader was listing', () => {
  const list = addField(addField([], { direction: 'income' }));
  assert.equal(list.length, 2);
  assert.equal(list[1].direction, 'income', 'inherits the direction of the field above');
  assert.equal(addField([], {})[0].direction, 'expense', 'an empty list starts with an expense');
  assert.equal(addField(list, { direction: 'expense' })[2].direction, 'expense', 'an explicit direction wins');
});

test('the list refuses to grow past its bound', () => {
  const full = normalizeFields(Array.from({ length: MAX_FIELDS }, () => ({})));
  assert.equal(addField(full).length, MAX_FIELDS);
  assert.equal(duplicateField(full, full[0].id, copyName, t).length, MAX_FIELDS);
});

test('updating touches one field and keeps its identity', () => {
  const list = defaultFields();
  const next = updateField(list, list[1].id, { label: 'Flat', amount: '900' });
  assert.equal(next[1].id, list[1].id);
  assert.equal(next[1].label, 'Flat');
  assert.equal(next[1].amount, '900');
  assert.equal(next[0].label, list[0].label, 'the other field is untouched');
  assert.equal(next[1].labelKey, list[1].labelKey, 'the default name is still there to fall back to');
  assert.equal(updateField(list, 'no-such-id', { label: 'x' })[0].label, list[0].label);
});

test('any field can become anything, including a default one', () => {
  const list = defaultFields();
  const flipped = updateField(list, list[1].id, { direction: 'income', label: 'Lodger' });
  assert.equal(flipped[1].direction, 'income');
  assert.equal(labelOf(flipped[1], t), 'Lodger');
});

test('a duplicate lands below its original with a name of its own', () => {
  const list = updateField(defaultFields(), defaultFields()[0].id, {});
  const source = list[1];
  const next = duplicateField(list, source.id, copyName, t);
  assert.equal(next.length, 3);
  assert.equal(next[2].id !== source.id, true, 'a copy is its own field');
  assert.equal(next[2].label, 'Rent (copy)');
  assert.equal(next[2].labelKey, '', 'a copy carries its own name, not the dictionary key');
  assert.equal(next[2].direction, source.direction);
  assert.equal(next[2].amount, source.amount);
  assert.deepEqual(duplicateField(list, 'nope', copyName, t), list);
});

test('a duplicate is inserted in place, not appended', () => {
  const list = [
    createField({ label: 'A' }), createField({ label: 'B' }), createField({ label: 'C' }),
  ];
  const next = duplicateField(list, list[0].id, copyName, t);
  assert.deepEqual(next.map((f) => f.label), ['A', 'A (copy)', 'B', 'C']);
});

test('removing drops exactly one field', () => {
  const list = defaultFields();
  assert.equal(removeField(list, list[0].id).length, 1);
  assert.equal(removeField(list, 'nope').length, 2);
  assert.equal(removeField(list, list[0].id)[0].id, list[1].id);
});

test('focus goes to the next field, or the previous one at the end', () => {
  const list = [createField(), createField(), createField()];
  assert.equal(neighbourOf(list, list[0].id), list[1].id);
  assert.equal(neighbourOf(list, list[2].id), list[1].id);
  assert.equal(neighbourOf([list[0]], list[0].id), null);
  assert.equal(neighbourOf(list, 'nope'), null);
});

test('operations never mutate what they are given', () => {
  const list = defaultFields();
  const snapshot = JSON.stringify(list);
  addField(list);
  updateField(list, list[0].id, { amount: '999' });
  duplicateField(list, list[0].id, copyName, t);
  removeField(list, list[0].id);
  assert.equal(JSON.stringify(list), snapshot);
});

test('the app starts with one income and one expense, both ordinary fields', () => {
  const list = defaultFields();
  assert.deepEqual(list.map((f) => f.direction), ['income', 'expense']);
  assert.deepEqual(list.map((f) => labelOf(f, t)), ['Income', 'Rent']);
  assert.equal(new Set(list.map((f) => f.id)).size, 2);
  for (const field of list) assert.ok(DIRECTIONS.includes(field.direction));
});

test('a store from before fields existed becomes two ordinary fields', () => {
  const migrated = migrateLegacyInputs({ income: '2750', rent: '980', months: 60 });
  assert.deepEqual(migrated.map((f) => f.direction), ['income', 'expense']);
  assert.deepEqual(migrated.map((f) => f.amount), ['2750', '980']);
  assert.deepEqual(migrated.map((f) => labelOf(f, t)), ['Income', 'Rent']);

  const empty = migrateLegacyInputs(null);
  assert.equal(empty.length, 2);
  assert.deepEqual(empty.map((f) => f.amount), ['', '']);
});
