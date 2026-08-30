import test from 'node:test';
import assert from 'node:assert/strict';

import { KNOBS, SOLVABLE, candidatesOf, solveFor } from '../assets/js/solve.js';
import { whenMet } from '../assets/js/milestones.js';
import {
  MAX_AMOUNT, project, toNumber,
} from '../assets/js/projection.js';
import { createField, normalizeFields, updateField } from '../assets/js/fields.js';
import { DEFAULT_PLAN, defaultStrategies } from '../assets/js/strategies.js';

const run = (fields, months = 240) => project({ fields, months });
const ask = (fields, milestone, pick, months = 240) => {
  const candidate = candidatesOf(fields).find(pick);
  assert.ok(candidate, 'the plan offers the figure being asked about');
  return solveFor({
    fields,
    fieldId: candidate.field.id,
    knob: candidate.knob,
    milestone,
    run: (list) => run(list, months),
    read: toNumber,
  });
};
const named = (label, knob) => (candidate) => (
  candidate.field.labelKey === label && candidate.knob === knob
);

/* --------------------------------------------------------- what is offered */

test('two figures are offered and no others, because two is what is monotone', () => {
  // The list is the seam, and it is short on purpose: a sell month moves both
  // what a holding grew to and what the cash then bought, and a loan's term
  // multiplies a payment that was rounded to the cent before the term touched
  // it. Neither can be bisected honestly, so neither is here.
  assert.deepEqual(KNOBS, ['amount', 'annualRate']);
  assert.equal(SOLVABLE.amount.low, 0);
  assert.equal(SOLVABLE.amount.high, MAX_AMOUNT, 'the app\'s own cap, so no answer is unstorable');
});

test('every field offers its amount; only the one-off, which has no rate box, withholds its rate', () => {
  const fields = normalizeFields([
    createField({ label: 'Pay', kind: 'plain', amount: '2000' }),
    createField({ label: 'Deposit', kind: 'once', amount: '5000' }),
    createField({ label: 'Fund', kind: 'investment', amount: '200', annualRate: '5' }),
  ]);
  const offered = candidatesOf(fields).map((candidate) => `${candidate.field.label}:${candidate.knob}`);
  assert.deepEqual(offered, [
    'Pay:amount', 'Pay:annualRate',
    'Deposit:amount',
    'Fund:amount', 'Fund:annualRate',
  ]);
  assert.deepEqual(candidatesOf('nonsense'), [], 'and anything that is not a plan offers nothing');
});

test('a field with an empty box is still something to ask about', () => {
  // `swingsOf` skips an amount nobody entered, because moving a tenth of
  // nothing ranks nothing. This is the opposite question: "what would I have to
  // put in here?" is asked of an empty box more often than of a full one.
  const fields = normalizeFields([createField({ label: 'Savings', kind: 'plain', amount: '' })]);
  assert.equal(candidatesOf(fields).length, 2);
});

/* ------------------------------------------------------------- the answer */

test('a target the plan misses says what one figure would have to be to meet it', () => {
  // The question the three opening plans are three answers to, asked backwards:
  // the borrower's house is worth 134,960.6 after twenty years, and a reader
  // who wants 900,000 of property is asking what they would have had to buy.
  const [borrowing] = defaultStrategies();
  const fields = normalizeFields(borrowing.fields);
  const milestone = { metric: 'owned', amount: '900000' };
  assert.equal(whenMet(run(fields), milestone, toNumber).month, null, 'not within twenty years');

  const answer = ask(fields, milestone, named('field.default.house', 'amount'));
  assert.equal(answer.bound, 'least', 'more of it is what gets there');
  assert.equal(answer.answer, 666862);
  assert.equal(answer.month, 240);
});

test('the figure that comes back is one the plan actually reaches the target with', () => {
  // The whole of what makes the answer a fact rather than a claim: it is put
  // back through `updateField` — the same coercion typing it would go through —
  // and the month is read off that projection by the same `whenMet` the line
  // above it uses.
  const [borrowing] = defaultStrategies();
  const fields = normalizeFields(borrowing.fields);
  const milestone = { metric: 'owned', amount: '900000' };
  const answer = ask(fields, milestone, named('field.default.house', 'amount'));

  const house = fields.find((field) => field.labelKey === 'field.default.house');
  const reading = whenMet(run(updateField(fields, house.id, { amount: String(answer.answer) })), milestone, toNumber);
  assert.equal(reading.month, answer.month);
  assert.ok(reading.value >= 900000, 'and it clears the figure rather than landing under it');
});

test('a figure is rounded away from the goal, so "or more" is true of it', () => {
  // 666,861.5 would be arithmetically right and useless: a reader who typed it
  // would be a fraction of a unit short of the thing they were told it bought.
  const [borrowing] = defaultStrategies();
  const fields = normalizeFields(borrowing.fields);
  const milestone = { metric: 'owned', amount: '900000' };
  const answer = ask(fields, milestone, named('field.default.house', 'amount'));
  assert.equal(answer.answer, Math.ceil(answer.answer), 'whole units, rounded up');

  const house = fields.find((field) => field.labelKey === 'field.default.house');
  const short = whenMet(
    run(updateField(fields, house.id, { amount: String(answer.answer - 1) })),
    milestone,
    toNumber,
  );
  assert.equal(short.month, null, 'and one unit less does not get there');
});

test('where less of a figure is what gets there, the answer is a ceiling', () => {
  // Both endings are real, and which one a reader is handed is decided by which
  // limit meets the target rather than by anything said about the field: more
  // salary carries the borrower past 400,000, and so does a smaller mortgage.
  const [borrowing] = defaultStrategies();
  const fields = normalizeFields(borrowing.fields);
  const milestone = { metric: 'worth', amount: '400000' };

  const more = ask(fields, milestone, named('field.default.salary', 'amount'));
  assert.equal(more.bound, 'least');
  const less = ask(fields, milestone, named('field.default.mortgage', 'amount'));
  assert.equal(less.bound, 'most');

  const mortgage = fields.find((field) => field.labelKey === 'field.default.mortgage');
  const reading = whenMet(
    run(updateField(fields, mortgage.id, { amount: String(less.answer) })),
    milestone,
    toNumber,
  );
  assert.equal(reading.month, less.month, 'and the ceiling is proved the same way the floor is');
});

test('a rate is solved to a tenth of a point, and may be a negative one', () => {
  // Nobody negotiates a mortgage to the hundredth, and an answer written that
  // way would claim a precision the model has not got. A return that has to
  // *fall* is a perfectly ordinary answer, which is why the figure that carries
  // it to the screen cannot be the one that floors rates at nothing.
  const [borrowing] = defaultStrategies();
  const fields = normalizeFields(borrowing.fields);
  const rising = ask(fields, { metric: 'owned', amount: '900000' }, named('field.default.house', 'annualRate'));
  assert.equal(rising.bound, 'least');
  assert.equal(Math.round(rising.answer * 10) / 10, rising.answer, 'a tenth of a point');

  const falling = ask(fields, { metric: 'worth', amount: '400000' }, named('field.default.living', 'annualRate'));
  assert.equal(falling.bound, 'most');
  assert.ok(falling.answer < 0, 'the living costs would have to shrink year on year');
});

test('an answer is in whatever money the run it was handed is in', () => {
  // The same reason `swingsOf` takes its own run: restated or not, taxed or
  // not, an answer has to be in the money of the page it is shown on. A shorter
  // horizon is the plainest form of the same handle — the same target, asked of
  // ten years rather than twenty, wants a bigger figure.
  const [borrowing] = defaultStrategies();
  const fields = normalizeFields(borrowing.fields);
  const milestone = { metric: 'owned', amount: '900000' };
  const far = ask(fields, milestone, named('field.default.house', 'amount'), 240);
  const near = ask(fields, milestone, named('field.default.house', 'amount'), 120);
  assert.ok(near.answer > far.answer, `${near.answer} over ten years, ${far.answer} over twenty`);
});

/* ------------------------------------------------------------ the refusals */

test('a figure that leaves the target where it was says so, rather than naming one', () => {
  // The borrower's salary does not buy property. Nothing about `owned` moves
  // when it changes, and a reader is better told that than handed a figure.
  const [borrowing] = defaultStrategies();
  const fields = normalizeFields(borrowing.fields);
  const answer = ask(fields, { metric: 'owned', amount: '900000' }, named('field.default.salary', 'amount'));
  assert.deepEqual(answer, { refusal: 'unmoved' });
});

test('a figure that moves the target but never far enough is told apart from one that does not move it', () => {
  // Two different next moves for the reader: one says look somewhere else in
  // the plan, the other says this is the right figure and the target is out of
  // the app's range whatever you do to it.
  const [borrowing] = defaultStrategies();
  const fields = normalizeFields(borrowing.fields);
  const answer = ask(fields, { metric: 'worth', amount: '400000' }, named('field.default.propertyTax', 'amount'));
  assert.deepEqual(answer, { refusal: 'unreachable' });
});

test('nothing is answered where there is nothing to answer', () => {
  const [borrowing] = defaultStrategies();
  const fields = normalizeFields(borrowing.fields);
  const house = fields.find((field) => field.labelKey === 'field.default.house');
  const at = (over) => solveFor({
    fields, run, read: toNumber, ...over,
  });
  assert.equal(at({ fieldId: house.id, knob: 'amount', milestone: { metric: 'owned', amount: '' } }), null, 'an empty target');
  assert.equal(at({ fieldId: house.id, knob: 'amount', milestone: { metric: 'moon', amount: '1' } }), null, 'a quantity the projection has not got');
  assert.equal(at({ fieldId: house.id, knob: 'sellMonth', milestone: { metric: 'owned', amount: '1' } }), null, 'a figure that is not offered');
  assert.equal(at({ fieldId: 'nobody', knob: 'amount', milestone: { metric: 'owned', amount: '1' } }), null, 'a field that is not there');
});

/*
 * The two refusals below are driven through the `run` seam with a run that is
 * not the model, and deliberately so. The whole reason an amount and a rate are
 * the two figures offered is that neither of them turns the model round, so
 * there is no plan a test could write that would make the model do it. What is
 * being held here is that the search would catch it if one ever did — which is
 * exactly the guarantee that is worth keeping if a third figure is ever added.
 */

/** A run whose only point is whatever `shape` says the one figure is worth. */
const shaped = (shape) => (fields) => ({
  points: [{ month: 0, net: 0 }, { month: 1, net: shape(toNumber(fields[0].amount)) }],
  months: 1,
  taxRate: 0,
  fields,
});
const oneField = normalizeFields([createField({ label: 'Knob', amount: '100' })]);
const shapedAsk = (shape) => solveFor({
  fields: oneField,
  fieldId: oneField[0].id,
  knob: 'amount',
  milestone: { metric: 'net', amount: '100' },
  run: shaped(shape),
  read: toNumber,
});

test('a target met at both limits and not in between is two crossings, so neither is offered', () => {
  // Caught before a single halving, by the two probes that bracket the search:
  // the plan as it stands does not meet the target and sits between those
  // limits, so both of them meeting it means the relationship turned round.
  assert.deepEqual(shapedAsk((x) => (x < 1 || x > 1e10 ? 200 : 0)), { refusal: 'reversal' });
});

test('a target that stops being met past the answer is not answered with "or more"', () => {
  // The shape the two end probes cannot see: it meets, stops meeting, and meets
  // again at the far limit. Bisection lands on the first boundary quite
  // happily; sampling the stretch beyond it is what catches that "or more" is
  // not true of the figure it found.
  assert.deepEqual(
    shapedAsk((x) => ((x >= 4e10 && x < 6e10) || x >= 9.5e10 ? 200 : 0)),
    { refusal: 'reversal' },
  );
});

test('a figure that would turn the target round is not an answer to it', () => {
  // The last guard, and the one that makes the month a fact. Which side counts
  // as met is decided by the side the plan opens on, and a big enough figure
  // can move the opening month itself: a house already worth more than the
  // target on the day it is bought turns "reaches 900,000" from a climb into a
  // fall, and the target as the reader wrote it is no longer met at all. The
  // search holds its own direction fixed — it would otherwise be bisecting two
  // questions at once — and the run back through `whenMet` is what notices.
  const answer = solveFor({
    fields: oneField,
    fieldId: oneField[0].id,
    knob: 'amount',
    milestone: { metric: 'net', amount: '100' },
    run: (fields) => {
      const past = toNumber(fields[0].amount) >= 1000 ? 200 : 0;
      return {
        points: [{ month: 0, net: past }, { month: 1, net: past }], months: 1, taxRate: 0, fields,
      };
    },
    read: toNumber,
  });
  assert.deepEqual(answer, { refusal: 'unproven' });
});

/* ---------------------------------------------------------------- the plan */

test('the target the app opens with can be asked backwards on every opening plan', () => {
  // The house each of the three plans buys is the app's own worked example, so
  // a target well past it is the question this feature exists for. Every plan
  // must answer it or refuse it in words — never throw, and never hand back
  // a figure that does not do what it says.
  const milestone = { metric: 'owned', amount: String(Number(DEFAULT_PLAN.house) * 9) };
  for (const strategy of defaultStrategies()) {
    const fields = normalizeFields(strategy.fields);
    for (const candidate of candidatesOf(fields)) {
      const answer = solveFor({
        fields,
        fieldId: candidate.field.id,
        knob: candidate.knob,
        milestone,
        run,
        read: toNumber,
      });
      assert.ok(answer, `${strategy.nameKey}/${candidate.field.labelKey}/${candidate.knob} says something`);
      if (answer.refusal) continue;
      const reading = whenMet(
        run(updateField(fields, candidate.field.id, { [candidate.knob]: String(answer.answer) })),
        milestone,
        toNumber,
      );
      assert.equal(reading.month, answer.month, `${candidate.field.labelKey}/${candidate.knob} reproduces its month`);
    }
  }
});
