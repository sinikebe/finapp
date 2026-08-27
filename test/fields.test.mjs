import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIRECTIONS, FIELD_SHAPE, FIELD_SCHEMA, MAX_FIELDS, MAX_LABEL_LENGTH,
  PERIODS, DEFAULT_PERIOD, KINDS, DEFAULT_TERM,
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

test('a labelKey the dictionary does not know reads as unnamed, not as the key', () => {
  const stranger = createField({ labelKey: 'field.from.some.other.version' });
  assert.equal(labelOf(stranger, t), '');
  assert.equal(labelOf(createField({ labelKey: 'field.default.rent' }), t), 'Rent');
});

test('the schema is the only edit a new attribute needs', () => {
  // The promise the field model makes: add an entry here and normalisation,
  // creation, duplication and a storage round-trip all carry it.
  //
  // A key the schema has *not* got, because that is the promise. Standing on
  // `startMonth` proved nothing about a new attribute — and the teardown then
  // deleted a live one, which is why running the files in one process took
  // fifteen other tests down with it.
  const found = Object.keys(FIELD_SCHEMA);
  assert.ok(!found.includes('category'), 'category is genuinely new, or this proves nothing');
  FIELD_SCHEMA.category = {
    default: 'none',
    read: (value) => (typeof value === 'string' && value ? value : 'none'),
  };
  try {
    const field = createField({ direction: 'expense', amount: '500', category: 'housing' });
    assert.equal(field.category, 'housing', 'createField carries it');
    assert.equal(createField().category, 'none', 'and defaults it');
    assert.equal(normalizeField({ category: {} }).category, 'none', 'and coerces it');

    const list = duplicateField([field], field.id, (name) => `${name} (copy)`, t);
    assert.equal(list[1].category, 'housing', 'duplication carries it');

    const roundTripped = normalizeFields(JSON.parse(JSON.stringify(list)));
    assert.equal(roundTripped[1].category, 'housing', 'a storage round trip carries it');

    assert.equal(updateField(list, field.id, { amount: '600' })[0].category, 'housing', 'updates keep it');
  } finally {
    delete FIELD_SCHEMA.category;
  }
  // Outside the finally, so it is checked after the restoring: a test that
  // leaves the model altered is a test that breaks whichever runs next.
  assert.deepEqual(Object.keys(FIELD_SCHEMA), found, 'and the schema is left as it was found');
});

test('the schema and the shape it derives cannot drift apart', () => {
  // FIELD_SHAPE is built from FIELD_SCHEMA once, at load, so nothing that
  // reaches into either at runtime can be allowed to leave them disagreeing —
  // `sameButForId` walks the shape while `normalizeField` walks the schema, and
  // an attribute in one but not the other is an attribute silently unread.
  assert.deepEqual(Object.keys(FIELD_SHAPE), Object.keys(FIELD_SCHEMA));
  assert.deepEqual(Object.keys(createField()), Object.keys(FIELD_SHAPE));
});

test('how often an amount lands is part of the field, and defaults to monthly', () => {
  assert.equal(createField().periodMonths, DEFAULT_PERIOD);
  assert.equal(createField({ periodMonths: 12 }).periodMonths, 12);
  assert.equal(normalizeField({ periodMonths: '3' }).periodMonths, 3, 'a stored string reads as a number');
  assert.equal(normalizeField({ periodMonths: 5 }).periodMonths, 1, 'an unsupported period reads as monthly');
  assert.equal(normalizeField({ periodMonths: 'yearly' }).periodMonths, 1);
  assert.equal(normalizeField({}).periodMonths, 1, 'a store written before periods existed reads as monthly');
  for (const period of PERIODS) assert.equal(normalizeField({ periodMonths: period }).periodMonths, period);
});

test('a duplicate keeps how often the original landed', () => {
  const list = [createField({ label: 'Insurance', direction: 'expense', amount: '1440', periodMonths: 12 })];
  const next = duplicateField(list, list[0].id, copyName, t);
  assert.equal(next[1].periodMonths, 12);
  assert.equal(next[1].amount, '1440');
});

test('a field knows what it is, and coerces anything else to a plain amount', () => {
  assert.equal(createField().kind, 'plain');
  for (const kind of KINDS) assert.equal(createField({ kind }).kind, kind);
  assert.equal(normalizeField({ kind: 'mortgage' }).kind, 'plain');
  assert.equal(normalizeField({ kind: 42 }).kind, 'plain');
  assert.equal(normalizeField({}).kind, 'plain', 'a store written before kinds existed');
});

test('a term is a whole number of months inside the projection horizon', () => {
  assert.equal(createField().termMonths, DEFAULT_TERM);
  assert.equal(normalizeField({ termMonths: '240' }).termMonths, 240);
  assert.equal(normalizeField({ termMonths: 18.7 }).termMonths, 18);
  assert.equal(normalizeField({ termMonths: 0 }).termMonths, DEFAULT_TERM);
  assert.equal(normalizeField({ termMonths: -5 }).termMonths, DEFAULT_TERM);
  assert.equal(normalizeField({ termMonths: 'ages' }).termMonths, DEFAULT_TERM);
  assert.equal(normalizeField({ termMonths: 1e9 }).termMonths, 600);
});

test('a rate is kept as typed, for the projection to make sense of', () => {
  assert.equal(createField({ annualRate: '5.9' }).annualRate, '5.9');
  assert.equal(normalizeField({ annualRate: 7 }).annualRate, '7');
  assert.equal(normalizeField({ annualRate: {} }).annualRate, '');
  assert.equal(createField().annualRate, '');
});

test('an investment is always money going out, whatever the store says', () => {
  assert.equal(createField({ kind: 'investment', direction: 'income' }).direction, 'expense');
  assert.equal(normalizeField({ kind: 'investment', direction: 'income' }).direction, 'expense');
  // Through an update too, which is the path the reader actually takes: the
  // direction select is hidden on an investment, but a store — or a kind
  // switched after the fact — can still ask for income.
  const list = [createField({ kind: 'investment' })];
  assert.equal(updateField(list, list[0].id, { direction: 'income' })[0].direction, 'expense');
  const switched = [createField({ direction: 'income', amount: '300' })];
  assert.equal(updateField(switched, switched[0].id, { kind: 'investment' })[0].direction, 'expense');
});

test('a loan repays monthly, whatever period the store carries', () => {
  assert.equal(createField({ kind: 'loan', periodMonths: 12 }).periodMonths, 1);
  // Switching a quarterly amount into a loan settles its period too.
  const list = [createField({ periodMonths: 3, amount: '300' })];
  const asLoan = updateField(list, list[0].id, { kind: 'loan' });
  assert.equal(asLoan[0].periodMonths, 1);
  assert.equal(asLoan[0].amount, '300', 'and keeps what was already entered');
});

test('a duplicate of a loan or an investment is the same instrument', () => {
  const list = [createField({
    label: 'Mortgage', kind: 'loan', direction: 'expense', amount: '200000', annualRate: '4.5', termMonths: 300,
  })];
  const [, copy] = duplicateField(list, list[0].id, copyName, t);
  assert.equal(copy.kind, 'loan');
  assert.equal(copy.annualRate, '4.5');
  assert.equal(copy.termMonths, 300);
  assert.equal(copy.amount, '200000');
});
