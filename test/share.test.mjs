import test from 'node:test';
import assert from 'node:assert/strict';

import { FIELD_SCHEMA, createField, normalizeFields } from '../assets/js/fields.js';
import { MAX_STRATEGIES, defaultStrategies, normalizeStrategies } from '../assets/js/strategies.js';
import { MAX_MILESTONES } from '../assets/js/milestones.js';
import {
  PLAN_KEY,
  PLAN_VERSION,
  WIRE_KEYS,
  decodePlan,
  encodePlan,
  linkFor,
  planInHash,
} from '../assets/js/share.js';

const HOME = 'https://sinikebe.github.io/finapp/';

function planOf(strategies, extra = {}) {
  return {
    strategies: normalizeStrategies(strategies),
    months: 240,
    inflation: '2',
    spread: '3',
    tax: '30',
    realMoney: false,
    showRange: false,
    ...extra,
  };
}

test('a plan survives the trip in every figure a reader would check', () => {
  const before = planOf(defaultStrategies(), { realMoney: true, showRange: true });
  const after = decodePlan(encodePlan(before));

  assert.ok(after, 'the plan decodes');
  assert.equal(after.months, before.months);
  assert.equal(after.inflation, before.inflation);
  assert.equal(after.spread, before.spread);
  assert.equal(after.tax, before.tax);
  assert.equal(after.realMoney, true);
  assert.equal(after.showRange, true);
  assert.equal(after.strategies.length, before.strategies.length);

  for (const [index, strategy] of before.strategies.entries()) {
    const arrived = after.strategies[index];
    assert.equal(arrived.name, strategy.name, `strategy ${index} keeps its name`);
    // The key, not just the name: a plan the app named must arrive able to
    // follow the reader's language rather than frozen in the sharer's.
    assert.equal(arrived.nameKey, strategy.nameKey, `strategy ${index} keeps its name key`);
    assert.equal(arrived.fields.length, strategy.fields.length, `strategy ${index} keeps every field`);
    for (const [at, field] of strategy.fields.entries()) {
      for (const key of WIRE_KEYS) {
        assert.deepEqual(arrived.fields[at][key], field[key], `strategy ${index} field ${at}: ${key}`);
      }
    }
  }
});

test('every attribute a field has is one that travels', () => {
  // The list in share.js is a wire format and cannot be generated from the
  // schema, since its order may never change. So it is checked against it
  // instead: add an attribute to the model and forget this list, and the
  // attribute would simply never reach the person you shared the plan with —
  // silently, which is the kind of failure a test has to be the one to find.
  const modelled = Object.keys(FIELD_SCHEMA).filter((key) => key !== 'id');
  assert.deepEqual([...WIRE_KEYS].sort(), [...modelled].sort(),
    'WIRE_KEYS carries exactly the attributes FIELD_SCHEMA defines, minus the id');
});

test('a value that is not the default is the only kind written down', () => {
  // What keeps a link short enough to paste: the packed plan for one plain
  // field names the two things about it that are not the default and nothing
  // else. A regression here is invisible except in the length of the address.
  const one = planOf([{ fields: [createField({ label: 'Rent', amount: '950' })] }]);
  const json = JSON.parse(Buffer.from(encodePlan(one), 'base64url').toString('utf8'));
  const [row] = json.s[0][2];
  assert.equal(row.length, 5, 'the slot plus two index/value pairs');
  assert.equal(row[0], 0, 'the first field takes the first slot');
  assert.deepEqual(
    [row[1], row[3]].map((index) => WIRE_KEYS[index]).sort(),
    ['amount', 'label'],
  );
});

test('two fields that are one field arrive as one field', () => {
  // A synced field is the same field in every strategy, and it is the same
  // field *because* its id is. Ids cannot travel — they mean nothing on
  // another device — so what has to survive is the sameness rather than the
  // value, which is what the slot numbering is for.
  const shared = createField({ label: 'Salary', direction: 'income', amount: '2200', synced: true });
  const before = planOf([
    { name: 'Now', fields: [shared, createField({ label: 'Rent', amount: '950' })] },
    { name: 'Later', fields: [shared, createField({ label: 'Mortgage', amount: '1100' })] },
  ]);

  const after = decodePlan(encodePlan(before));
  const [first, second] = after.strategies;
  assert.equal(first.fields[0].id, second.fields[0].id, 'the synced field is one field on the far side');
  assert.equal(first.fields[0].synced, true, 'and still says so');
  assert.notEqual(first.fields[1].id, second.fields[1].id, 'the unsynced ones are two');
  assert.notEqual(first.fields[0].id, shared.id, 'and none of them kept an id from the other device');
});

test('a link is this page carrying the plan, and nothing of how you got here', () => {
  const plan = planOf([{ fields: [createField({ label: 'Rent', amount: '950' })] }]);
  const link = linkFor(plan, `${HOME}?utm_source=somewhere#already=here`);

  assert.ok(link.startsWith(`${HOME}#${PLAN_KEY}=`), `the link opens the app: ${link}`);
  assert.ok(!link.includes('utm_source'), 'a query string of your own does not go with it');
  assert.ok(!link.includes('already=here'), 'and neither does whatever was in the fragment');
  assert.ok(!/[+/=]/.test(planInHash(new URL(link).hash)),
    'the packed plan survives a chat window: no + / or = in it');

  const round = decodePlan(planInHash(new URL(link).hash));
  assert.equal(round.strategies[0].fields[0].label, 'Rent');
});

test('the fragment is read as parameters, not as a whole', () => {
  assert.equal(planInHash(''), '');
  assert.equal(planInHash('#'), '');
  assert.equal(planInHash('#nothing=here'), '');
  assert.equal(planInHash(`#${PLAN_KEY}=abc`), 'abc');
  assert.equal(planInHash(`#other=1&${PLAN_KEY}=abc`), 'abc', 'even beside something else');
});

test('a plan that is not one is refused rather than half-read', () => {
  for (const text of ['', 'not base64 !!', 'bm90IGpzb24', null, undefined, 42]) {
    assert.equal(decodePlan(text), null, `refused: ${String(text)}`);
  }
  // Valid base64 of valid JSON that is not a plan.
  const notAPlan = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  assert.equal(decodePlan(notAPlan([1, 2, 3])), null, 'an array is not a plan');
  assert.equal(decodePlan(notAPlan({ v: PLAN_VERSION })), null, 'a plan with no strategies is not one');
  assert.equal(decodePlan(notAPlan({ v: PLAN_VERSION, s: [] })), null, 'nor is one with an empty list');
  assert.equal(decodePlan(notAPlan({ v: PLAN_VERSION + 1, s: [['', '', []]] })), null,
    'a version this build cannot promise to read is refused rather than guessed at');
});

test('a link written by a later version is read as far as this one understands', () => {
  // The other half of the same bargain: a newer build may add an attribute, and
  // the index it uses for it is one this build has never heard of. Skipping it
  // keeps every other figure in the plan; refusing the plan would mean one
  // added attribute breaks every link in circulation.
  const packed = {
    v: PLAN_VERSION,
    m: 120,
    i: '2',
    sp: '3',
    tx: '30',
    s: [['Later', '', [[0, WIRE_KEYS.indexOf('label'), 'Rent', WIRE_KEYS.length + 3, 'whatever this is']]]],
  };
  const after = decodePlan(Buffer.from(JSON.stringify(packed), 'utf8').toString('base64url'));
  assert.ok(after, 'the plan still opens');
  assert.equal(after.months, 120);
  assert.equal(after.strategies[0].fields[0].label, 'Rent');
});

test('a link is as untrustworthy as a hand-edited store, and read the same way', () => {
  // Everything arriving goes through the model's own coercion, so nothing a
  // link can say puts a value in the app that the app could not have made.
  const hostile = {
    v: PLAN_VERSION,
    m: 999999,
    i: 'nonsense',
    sp: 'nonsense',
    tx: 'nonsense',
    s: Array.from({ length: MAX_STRATEGIES + 3 }, () => ['x'.repeat(200), '', [
      [0, WIRE_KEYS.indexOf('direction'), 'sideways', WIRE_KEYS.indexOf('kind'), 'magic',
        WIRE_KEYS.indexOf('periodMonths'), 7, WIRE_KEYS.indexOf('termMonths'), 1e9],
    ]]),
  };
  const after = decodePlan(Buffer.from(JSON.stringify(hostile), 'utf8').toString('base64url'));

  assert.ok(after.strategies.length <= MAX_STRATEGIES, 'no more strategies than the app allows');
  const field = after.strategies[0].fields[0];
  assert.equal(field.direction, 'expense', 'a direction that is not one reads as the default');
  assert.equal(field.kind, 'plain', 'and so does a kind');
  assert.equal(field.periodMonths, 1, 'a period that is not one of the periods');
  assert.ok(field.termMonths <= 600, 'and a term stays inside the projection');
  assert.ok(after.strategies.every((strategy) => strategy.name.length <= 40), 'names are cut to length');
  assert.equal(new Set(after.strategies.map((strategy) => strategy.id)).size, after.strategies.length,
    'and every strategy is its own');
});

test('a plan worth sharing fits in something you can paste', () => {
  // Not a style rule: a link nobody can paste is a feature that does not work.
  // The plans the app opens with are the largest thing it can produce without
  // the reader having built it themselves, so they are the ceiling worth
  // holding — and a plan somebody actually typed is a fraction of it.
  const demo = linkFor(planOf(defaultStrategies()), HOME);
  assert.ok(demo.length < 2500, `the three worked plans fit in a link: ${demo.length} characters`);

  const mine = linkFor(planOf([{ name: 'Now', fields: [
    createField({ label: 'Salary', direction: 'income', amount: '3200' }),
    createField({ label: 'Rent', amount: '950' }),
    createField({ label: 'Groceries', amount: '400' }),
    createField({ label: 'Index fund', kind: 'investment', amount: '300', annualRate: '6' }),
  ] }]), HOME);
  assert.ok(mine.length < 500, `one plan of four fields is a short link: ${mine.length} characters`);
});

test('a name in any language arrives as itself', () => {
  // The fragment is base64 of UTF-8 rather than of whatever `escape` produces,
  // which is the difference between these arriving and arriving mangled.
  const names = ['Épargne « prudente »', '住宅ローン', 'Крипта 🚀'];
  const before = planOf([{ name: names[0], fields: names.map((label) => createField({ label, amount: '1' })) }]);
  const after = decodePlan(encodePlan(before));
  assert.equal(after.strategies[0].name, names[0]);
  assert.deepEqual(after.strategies[0].fields.map((field) => field.label), names);
});

test('the targets travel, because they are part of what is being asked', () => {
  // "Here is how I would buy it" usually means "and here is when it happens".
  // A link that dropped the targets would arrive as somebody's figures with
  // their question taken out of it.
  const before = planOf(defaultStrategies(), {
    milestones: [
      { id: 'local-1', metric: 'owned', amount: '100000' },
      { id: 'local-2', metric: 'debt', amount: '0' },
    ],
  });
  const after = decodePlan(encodePlan(before));
  assert.deepEqual(
    after.milestones,
    [{ metric: 'owned', amount: '100000' }, { metric: 'debt', amount: '0' }],
    'the quantity and the figure arrive, and the id does not — it meant nothing here',
  );

  // A plan with no targets says nothing about them at all, rather than paying
  // for an empty list in every link anybody pastes.
  const bare = JSON.parse(Buffer.from(encodePlan(planOf(defaultStrategies())), 'base64url').toString('utf8'));
  assert.equal('ms' in bare, false);
  assert.deepEqual(decodePlan(encodePlan(planOf(defaultStrategies()))).milestones, []);
});

test('a target arriving in a link is shaped, and judged by whoever holds the list', () => {
  // The same bargain the scalars strike: `decodePlan` makes a target-shaped
  // thing out of whatever is there, and the app — which is what knows the eight
  // quantities a target may watch — decides whether it is one it will accept.
  const packed = {
    v: PLAN_VERSION,
    m: 120,
    s: [['Later', '', []]],
    ms: [['worth', 250000], ['the moon', {}], 'not even a pair',
      ...Array.from({ length: 20 }, () => ['net', '1'])],
  };
  const after = decodePlan(Buffer.from(JSON.stringify(packed), 'utf8').toString('base64url'));
  assert.ok(after.milestones.length <= MAX_MILESTONES, 'no more targets than the app allows');
  assert.deepEqual(after.milestones[0], { metric: 'worth', amount: '250000' },
    'a figure written as a number arrives as the text every amount in the app is');
  assert.deepEqual(after.milestones[1], { metric: 'the moon', amount: '' },
    'and a quantity this format has no opinion about is passed on for one that has');
});

test('what a plan does not carry is what is not part of a plan', () => {
  // The same line the reset button draws: your theme and your language are
  // preferences about reading the app, and sharing a plan must not reach across
  // and change somebody else's.
  const packed = JSON.parse(Buffer.from(encodePlan(planOf(defaultStrategies())), 'base64url').toString('utf8'));
  const text = JSON.stringify(packed);
  for (const absent of ['theme', 'lang', 'dark', 'light']) {
    assert.ok(!text.includes(absent), `a plan says nothing about ${absent}`);
  }
});

test('an empty plan is nothing to share rather than a link to nowhere', () => {
  assert.equal(encodePlan(null), '');
  assert.equal(encodePlan({}), '');
  assert.equal(linkFor(null, HOME), '');
});

test('fields arrive in the order they were written in', () => {
  // The list is read top to bottom and a reader compares it against their own,
  // so the order is part of what is being shared.
  const labels = ['One', 'Two', 'Three', 'Four', 'Five'];
  const before = planOf([{ fields: normalizeFields(labels.map((label) => ({ label, amount: '1' }))) }]);
  const after = decodePlan(encodePlan(before));
  assert.deepEqual(after.strategies[0].fields.map((field) => field.label), labels);
});
