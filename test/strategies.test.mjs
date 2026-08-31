import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_STRATEGIES, MAX_NAME_LENGTH,
  createStrategy, normalizeStrategy, normalizeStrategies, nameOf, activeIdOf,
  addStrategy, updateStrategy, duplicateStrategy, removeStrategy, neighbourOf,
  spreadField, unlinkField, removeEverywhere,
  migrateFields, defaultStrategies, originStateOf, markShared,
} from '../assets/js/strategies.js';
import { createField, labelOf, FIELD_SHAPE } from '../assets/js/fields.js';

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

test('a copy of a plan the app named is that plan, again', () => {
  // `nameOf` resolves a `nameKey` exactly as a field's `labelKey` is resolved,
  // so a plan named that way is named — and all three the app opens with are.
  // Reading only `source.name` counted them as anonymous, so copying any of
  // them produced "Strategy 2" rather than "that, again".
  // A translator that knows the app's own keys, as the app's does — one that
  // does not is what `nameOf` reads as unnamed, and the last case here covers.
  const speaks = (key, position) => {
    if (key === 'strategy.defaultName') return `Strategy ${position}`;
    return key === 'strategy.default.loan' ? 'Buy now, on a loan' : key;
  };
  const app = normalizeStrategies(defaultStrategies());
  const copied = duplicateStrategy(app, app[0].id, copyName, speaks);
  assert.equal(nameOf(copied[1], 1, speaks), 'Buy now, on a loan (copy)', 'the copy carries the name');

  const mine = normalizeStrategies([{ name: 'Mine', fields: [] }]);
  assert.equal(nameOf(duplicateStrategy(mine, mine[0].id, copyName, t)[1], 1, t), 'Mine (copy)');

  // A plan known only by its position has no name to copy, and still gets none
  // — including one whose stored key this version's dictionary has never heard
  // of, which `nameOf` already reads as unnamed.
  const stale = normalizeStrategies([{ nameKey: 'strategy.default.gone', fields: [] }]);
  assert.equal(duplicateStrategy(stale, stale[0].id, copyName, t)[1].name, '');
  const anonymous = normalizeStrategies([{ fields: [] }, { fields: [] }]);
  const after = duplicateStrategy(anonymous, anonymous[0].id, copyName, t);
  assert.deepEqual(after.map((s, i) => nameOf(s, i, t)), ['Strategy 1', 'Strategy 2', 'Strategy 3']);
  assert.equal(after[1].name, '', 'and nothing was stored for it');
});

test('sync operations never mutate what they are given', () => {
  const before = normalizeStrategies([{ fields: [wage('4000')] }, { fields: [wage('4000')] }]);
  const snapshot = JSON.stringify(before);
  spreadField(before, { ...before[0].fields[0], synced: true, amount: '9' });
  unlinkField(before, before[0].fields[0].id);
  removeEverywhere(before, before[0].fields[0].id);
  assert.equal(JSON.stringify(before), snapshot);
});

/* ------------------------------------------- syncing a field nobody named */

/** A field as "Add a field" makes one: no name of the reader's, and none from
 *  the dictionary either. */
const unnamed = (amount, extra = {}) => createField({ amount, ...extra });

test('an unnamed field is nobody else\'s counterpart', () => {
  // Both strategies hold a field the reader never got round to naming. They
  // have nothing to do with each other; only the empty name is shared.
  const before = normalizeStrategies([
    { fields: [unnamed('4000', { direction: 'income' })] },
    { fields: [unnamed('1200', { kind: 'loan', annualRate: '3', termMonths: 240 })] },
  ]);
  const theirs = fieldsOf(before, 1)[0];

  const after = spreadField(before, { ...fieldsOf(before, 0)[0], synced: true });

  const kept = after[1].fields.find((field) => field.id === theirs.id);
  assert.ok(kept, 'a nameless field is not evidence that two fields are the same one');
  assert.deepEqual(
    [kept.amount, kept.kind, kept.annualRate, kept.termMonths],
    ['1200', 'loan', '3', 240],
    'so everything entered into it is still there',
  );
});

test('a strategy with no counterpart gains the unnamed field too', () => {
  const before = normalizeStrategies([
    { fields: [unnamed('4000', { direction: 'income' })] },
    { fields: [unnamed('900', { kind: 'once', startMonth: 12 })] },
  ]);
  const mine = fieldsOf(before, 0)[0];
  const theirs = fieldsOf(before, 1)[0];

  const after = spreadField(before, { ...mine, synced: true });

  assert.deepEqual(
    after[1].fields.map((field) => field.id),
    [theirs.id, mine.id],
    'theirs stays where it was and the synced one arrives after it',
  );
  const [own, arrived] = after[1].fields;
  assert.deepEqual(
    [own.amount, own.direction, own.kind, own.startMonth],
    ['900', 'expense', 'once', 12],
    'nothing of theirs was written over',
  );
  assert.deepEqual(
    [arrived.amount, arrived.direction, arrived.synced],
    ['4000', 'income', true],
    'and what arrived is the field that was synced',
  );
});

test('spreading an unnamed field again finds the copy it left', () => {
  const before = normalizeStrategies([
    { fields: [unnamed('4000', { direction: 'income' })] },
    { fields: [unnamed('700')] },
  ]);
  const mine = { ...fieldsOf(before, 0)[0], synced: true };
  // The first spread is what puts the copy there; from then on the id is what
  // links them, exactly as it is for a field with a name.
  const linked = spreadField(before, mine);
  const raised = spreadField(linked, { ...mine, amount: '4500' });

  assert.equal(raised[1].fields.length, 2, 'the second spread did not add a second copy');
  assert.equal(
    raised[1].fields.find((field) => field.id === mine.id).amount, '4500', 'it followed',
  );
  assert.equal(raised[1].fields[0].amount, '700', 'and their own field stood still through both');
});

test('an unnamed field syncs with the copy a new strategy made of it', () => {
  const before = normalizeStrategies([{ fields: [unnamed('4000', { direction: 'income' })] }]);
  // "Add a strategy" copies the one on screen, and a copy's unsynced fields
  // get ids of their own — so a field and its own copy are strangers by id,
  // and, unnamed, strangers by name as well. They are still one field: sync
  // must land on the copy rather than beside it, or this plan counts 4,000 a
  // month twice and the comparison chart says so.
  const two = duplicateStrategy(before, before[0].id, copyName, t);
  const mine = fieldsOf(two, 0)[0];
  assert.notEqual(fieldsOf(two, 1)[0].id, mine.id, 'the copy starts out a stranger by id');

  const after = spreadField(two, { ...mine, synced: true });

  assert.equal(after[1].fields.length, 1, 'the copy is the field, not a second one');
  assert.deepEqual(
    [after[1].fields[0].id, after[1].fields[0].amount, after[1].fields[0].synced],
    [mine.id, '4000', true],
    'and from here the two share one id',
  );
});

test('two identical unnamed fields sync as two, each onto its own copy', () => {
  // Two rows the reader typed the same figure into and never named. Copying
  // the strategy copies both, so syncing them has to pair them off one for
  // one rather than dropping both onto whichever copy comes first.
  const before = normalizeStrategies([{ fields: [unnamed('200'), unnamed('200')] }]);
  const two = duplicateStrategy(before, before[0].id, copyName, t);
  const [mine, also] = fieldsOf(two, 0);

  const once = spreadField(two, { ...mine, synced: true });
  const twice = spreadField(once, { ...fieldsOf(once, 0)[1], synced: true });

  assert.deepEqual(
    twice[1].fields.map((field) => field.id),
    [mine.id, also.id],
    'the second sync took the copy the first one had left, not the one it had taken',
  );
  for (const strategy of twice) {
    assert.deepEqual(
      strategy.fields.map((field) => [field.amount, field.synced]),
      [['200', true], ['200', true]],
      'two rows here, two rows there, and both of them linked',
    );
  }
});

test('an unnamed field adopts nothing that differs from it in any respect', () => {
  // Every attribute a field has, so that adding one to FIELD_SCHEMA has to be
  // thought about here too: what both fields hold, then the one thing theirs
  // holds differently.
  const differences = {
    labelKey: [{}, { labelKey: 'field.rent' }],
    label: [{}, { label: 'Rent' }],
    direction: [{}, { direction: 'income' }],
    amount: [{}, { amount: '4001' }],
    kind: [{}, { kind: 'loan' }],
    annualRate: [{}, { annualRate: '3' }],
    fees: [{}, { fees: '900' }],
    termMonths: [{ kind: 'loan' }, { termMonths: 120 }],
    periodMonths: [{}, { periodMonths: 12 }],
    startMonth: [{}, { startMonth: 6 }],
    endMonth: [{}, { endMonth: 24 }],
    sellMonth: [{ kind: 'investment' }, { sellMonth: 18 }],
    // Waiting on a target is a difference like any other: two rows that land in
    // the same month for different reasons are not the same row, and writing
    // over one of them would lose the reason.
    startAt: [{}, { startAt: 'target-1' }],
    endAt: [{}, { endAt: 'target-1' }],
    sellAt: [{ kind: 'investment' }, { sellAt: 'target-1' }],
  };
  assert.deepEqual(
    Object.keys(differences).sort(),
    Object.keys(FIELD_SHAPE).filter((key) => key !== 'id' && key !== 'synced').sort(),
    'every attribute a field has is a way two fields can differ, a new one included',
  );

  for (const [attribute, [shared, difference]] of Object.entries(differences)) {
    const before = normalizeStrategies([
      { fields: [unnamed('4000', shared)] },
      { fields: [unnamed('4000', { ...shared, ...difference })] },
    ]);
    const mine = fieldsOf(before, 0)[0];
    const theirs = fieldsOf(before, 1)[0];
    assert.notDeepEqual(
      { ...theirs, id: mine.id }, mine,
      `${attribute}: the difference has to survive normalisation, or this case proves nothing`,
    );

    const after = spreadField(before, { ...mine, synced: true });

    assert.equal(after[1].fields.length, 2, `a different ${attribute} makes it a different field`);
    assert.deepEqual(after[1].fields[0], theirs, 'so theirs is added to, never written over');
  }
});

test('a plan says where it came from, and a shared one says whether it still is', () => {
  // Four states rather than three: "somebody sent me this" and "somebody sent
  // me this and I have been editing it" are different things to know when you
  // are about to compare them against your own.
  const [preset] = defaultStrategies();
  assert.equal(originStateOf(normalizeStrategy(preset)), 'default');
  assert.equal(originStateOf(createStrategy({ name: 'Mine' })), 'own');

  const [shared] = markShared(normalizeStrategies([{ name: 'Theirs', fields: [{ label: 'Rent', amount: '950' }] }]));
  assert.equal(originStateOf(shared), 'shared');

  // Every kind of change counts, because the mark answers "is this still what
  // they sent me" and all three of these mean no.
  const renamed = { ...shared, name: 'Theirs, adjusted' };
  assert.equal(originStateOf(renamed), 'shared-edited', 'a rename is a change');

  const retyped = { ...shared, fields: shared.fields.map((f) => ({ ...f, amount: '1200' })) };
  assert.equal(originStateOf(retyped), 'shared-edited', 'a figure is a change');

  const added = { ...shared, fields: [...shared.fields, createField({ label: 'Car', amount: '300' })] };
  assert.equal(originStateOf(added), 'shared-edited', 'another field is a change');

  // And an id is not: the same plan on two devices has different ids for the
  // same fields, which is exactly what the imprint has to see past.
  const reidentified = { ...shared, fields: shared.fields.map((f) => ({ ...f, id: 'somewhere-else' })) };
  assert.equal(originStateOf(reidentified), 'shared', 'an id is not part of what a plan is');
});

test('origin is local, and survives a store that predates it', () => {
  // A store written before origins existed carries none. A nameKey is set by
  // nothing but defaultStrategies, so reading it as the worked example is
  // honest — and reading everything else as the reader's own is the only other
  // thing such a store could mean.
  assert.equal(normalizeStrategy({ nameKey: 'strategy.default.loan' }).origin, 'default');
  assert.equal(normalizeStrategy({ name: 'Whatever I called it' }).origin, 'own');
  assert.equal(normalizeStrategy({ origin: 'nonsense' }).origin, 'own', 'and a bad one is not trusted');
  assert.equal(normalizeStrategy({ origin: 'shared', nameKey: 'x' }).origin, 'shared', 'a real one wins');
});

test('a copy is your work, whatever it was a copy of', () => {
  // Duplicating somebody's shared plan makes a plan of yours: you are about to
  // change it, which is the only reason to have copied it.
  const t = (key) => key;
  const [shared] = markShared(normalizeStrategies([{ name: 'Theirs', fields: [{ label: 'Rent', amount: '950' }] }]));
  const list = normalizeStrategies([shared]);
  const copied = duplicateStrategy(list, list[0].id, (name) => `${name} (copy)`, t);
  assert.equal(copied.length, 2);
  assert.equal(originStateOf(copied[0]), 'shared', 'the original is untouched');
  assert.equal(originStateOf(copied[1]), 'own', 'the copy is yours');
  assert.equal(copied[1].imprint, '', 'and carries no record of an arrival it never had');
});

test('a shared plan does not become edited just by being stored and read back', () => {
  // The imprint is compared against a strategy that has been through
  // normalizeStrategy, so it has to be computed on one too — otherwise every
  // shared plan would read as edited the moment the page was reloaded.
  const [shared] = markShared(normalizeStrategies([{ name: 'Theirs', fields: [{ label: 'Rent', amount: '950' }] }]));
  const roundTripped = normalizeStrategy(JSON.parse(JSON.stringify(shared)));
  assert.equal(originStateOf(roundTripped), 'shared');
});
