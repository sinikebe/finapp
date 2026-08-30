import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_MILESTONES,
  addMilestone,
  defaultMilestones,
  neighbourOf,
  normalizeMilestones,
  removeMilestone,
  updateMilestone,
  whenMet,
} from '../assets/js/milestones.js';
import { inTodaysMoney, project, toNumber } from '../assets/js/projection.js';
import { createField } from '../assets/js/fields.js';
import { DEFAULT_PLAN, defaultStrategies } from '../assets/js/strategies.js';

/** The eight the comparison offers, which is the list the app hands in. */
const METRICS = ['net', 'worth', 'income', 'expenses', 'invested', 'profit', 'owned', 'debt'];

const run = (fields, months = 240) => project({ fields, months });

/* ---------------------------------------------------------------- the shape */

test('a target that is not one is read as a target the app could have made', () => {
  const [milestone] = normalizeMilestones([{ metric: 'the moon', amount: {}, id: 5 }], METRICS);
  assert.equal(milestone.metric, 'net', 'a quantity with no column reads as the first');
  assert.equal(milestone.amount, '', 'and a figure that is not one reads as empty');
  assert.equal(typeof milestone.id, 'string');
  assert.ok(milestone.id.length > 0, 'and it comes back with an id of its own');
});

test('a figure is kept exactly as it was typed', () => {
  // The same promise a field's amount makes: a French reader who wrote 12,50
  // and got back 12.5 would reasonably think the app had misread them.
  const [milestone] = normalizeMilestones([{ metric: 'worth', amount: '250 000,50' }], METRICS);
  assert.equal(milestone.amount, '250 000,50');
  assert.equal(toNumber(milestone.amount), 250000.5, 'and the reader makes sense of it');
});

test('a list is bounded, and every target in it is its own', () => {
  const many = Array.from({ length: MAX_MILESTONES + 4 }, () => ({ metric: 'worth', amount: '1', id: 'same' }));
  const list = normalizeMilestones(many, METRICS);
  assert.equal(list.length, MAX_MILESTONES);
  assert.equal(new Set(list.map((milestone) => milestone.id)).size, MAX_MILESTONES);
  assert.deepEqual(normalizeMilestones('nonsense', METRICS), []);
  assert.deepEqual(normalizeMilestones(undefined, METRICS), []);
});

test('every operation hands back a new list rather than editing the one it was given', () => {
  const before = normalizeMilestones([{ metric: 'worth', amount: '100' }], METRICS);
  const snapshot = JSON.parse(JSON.stringify(before));
  const added = addMilestone(before, METRICS, { metric: 'debt', amount: '0' });
  const changed = updateMilestone(added, added[0].id, { amount: '200' }, METRICS);
  const shorter = removeMilestone(changed, changed[0].id);

  assert.deepEqual(before, snapshot, 'the original is untouched throughout');
  assert.equal(added.length, 2);
  assert.equal(changed[0].amount, '200');
  assert.equal(changed[1].amount, '0', 'and nothing else moved with it');
  assert.equal(shorter.length, 1);
});

test('the list refuses to grow past its cap rather than silently dropping the oldest', () => {
  let list = [];
  for (let i = 0; i < MAX_MILESTONES + 3; i += 1) {
    list = addMilestone(list, METRICS, { metric: 'worth', amount: String(i) });
  }
  assert.equal(list.length, MAX_MILESTONES);
  assert.equal(list[0].amount, '0', 'the first one asked for is still the first one there');
});

test('the target that takes focus when one is removed is the next, else the previous', () => {
  const list = normalizeMilestones(
    [{ metric: 'net', amount: '1' }, { metric: 'worth', amount: '2' }, { metric: 'debt', amount: '3' }],
    METRICS,
  );
  assert.equal(neighbourOf(list, list[0].id), list[1].id);
  assert.equal(neighbourOf(list, list[2].id), list[1].id);
  assert.equal(neighbourOf(list, 'not here'), null);
  assert.equal(neighbourOf([list[0]], list[0].id), null, 'the last one leaves nothing behind');
});

/* ----------------------------------------------------------------- the read */

test('a target met on the way up is met the first month the figure is reached', () => {
  // A thousand a month, so month 3 is the first at three thousand — and month
  // 0, which is nothing earned yet, is not it.
  const projection = run([createField({ direction: 'income', amount: '1000' })], 24);
  const reading = whenMet(projection, { metric: 'income', amount: '3000' }, toNumber);
  assert.deepEqual(reading, { month: 3, value: 3000 });
});

test('a target met on the way down is met the first month the figure is fallen to', () => {
  // "Debt clear" is the same question asked of a quantity that starts above its
  // figure, and it is answered by the same rule rather than by a second kind of
  // target: which side counts as met is decided by the side the plan opens on.
  const projection = run([createField({
    kind: 'loan', direction: 'expense', amount: '12000', termMonths: 12,
  })], 24);
  const reading = whenMet(projection, { metric: 'debt', amount: '0' }, toNumber);
  assert.equal(reading.month, 12, 'the month the last repayment lands');
  assert.equal(reading.value, 0);
  assert.equal(projection.points[11].debt > 0, true, 'and it was still owed the month before');
});

test('a target already true at month 0 is true from month 0, not reached at it', () => {
  // The plan the app opens with owns the house from the outset — the keys and
  // the debt change hands together — so its target is met before a month has
  // passed. That is an answer, and a different one from "it got there".
  const [borrowing] = defaultStrategies();
  const projection = run(borrowing.fields);
  const reading = whenMet(projection, { metric: 'owned', amount: DEFAULT_PLAN.house }, toNumber);
  assert.equal(reading.month, 0);
  assert.equal(reading.value, Number(DEFAULT_PLAN.house));
});

test('a target never reached says what the projection ended at instead', () => {
  const projection = run([createField({ direction: 'income', amount: '1000' })], 24);
  const reading = whenMet(projection, { metric: 'income', amount: '9999999' }, toNumber);
  assert.equal(reading.month, null, 'no month, because there is no month');
  assert.equal(reading.value, 24000, 'and the figure it did reach, so the answer is a figure');
});

test('a target crossed and lost again is marked where it was first crossed', () => {
  // Two thousand a month for six months and nothing after, against a bill that
  // lands in month 10: the net climbs past 10,000, then falls back under it.
  // Both crossings are true; the first is the one that answers "when".
  const projection = run([
    createField({ direction: 'income', amount: '2000', endMonth: 6 }),
    createField({ kind: 'once', direction: 'expense', amount: '5000', startMonth: 10 }),
  ], 24);
  const reading = whenMet(projection, { metric: 'net', amount: '10000' }, toNumber);
  assert.equal(reading.month, 5);
  assert.equal(projection.points[24].net < 10000, true, 'and it is under the figure at the end');
});

test('a target with nothing in its box is nothing to read rather than a target at zero', () => {
  const projection = run([createField({ direction: 'income', amount: '1000' })], 24);
  assert.equal(whenMet(projection, { metric: 'net', amount: '' }, toNumber), null);
  assert.equal(whenMet(projection, { metric: 'net', amount: 'soon' }, toNumber), null);
  // A quantity the projection does not carry is the same kind of nothing: a
  // hand-edited store may name one, and it must not read as met at month 0.
  assert.equal(whenMet(projection, { metric: 'contributions', amount: '10' }, toNumber), null);
});

test('a target is read in whatever money the projection was run in', () => {
  // The figure being watched for is the figure on screen. Restating a plan in
  // today's money moves every point, so the month a target is met moves with
  // it — which is right, and only works because the read takes the projection
  // it is handed rather than running one of its own.
  const fields = [createField({ direction: 'income', amount: '1000' })];
  const nominal = run(fields, 240);
  const target = { metric: 'income', amount: '100000' };
  assert.equal(whenMet(nominal, target, toNumber).month, 100);

  const restated = inTodaysMoney(nominal, '2');
  const later = whenMet(restated, target, toNumber).month;
  assert.ok(later > 100, `a hundred thousand buys less later, so it takes longer: ${later}`);
});

/* -------------------------------------------------------- the opening plans */

test('the month a plan can afford the house is now something the app can say', () => {
  // The project's own hard-coded answer, read back out of the projection.
  // `strategies.js` works those months out by hand because nothing in the model
  // is conditional — and this is the whole point of the feature: the month was
  // always there in the answer, and nothing but a read was needed to show it.
  const [, saveUp, sellFund] = defaultStrategies();
  const target = { metric: 'owned', amount: DEFAULT_PLAN.house };
  assert.equal(whenMet(run(saveUp.fields), target, toNumber).month, DEFAULT_PLAN.buyOnCash);
  assert.equal(whenMet(run(sellFund.fields), target, toNumber).month, DEFAULT_PLAN.buyOnBoth);
});

test('the target the app opens with is the question the opening plans answer', () => {
  // Its figure comes from the same constant the three plans are built from, so
  // moving the house price moves the question with it rather than leaving a
  // target watching for a number nothing in the app spends any more.
  const [milestone, ...rest] = defaultMilestones();
  assert.equal(rest.length, 0, 'one target, the way the app opens on one strategy');
  assert.equal(milestone.metric, 'owned');
  assert.equal(milestone.amount, DEFAULT_PLAN.house);
  assert.ok(METRICS.includes(milestone.metric), 'and it is one of the eight the app offers');
});
