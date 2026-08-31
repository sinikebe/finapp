import test from 'node:test';
import assert from 'node:assert/strict';

import { schedule, waitsOnAnything } from '../assets/js/schedule.js';
import { normalizeFields } from '../assets/js/fields.js';
import { normalizeMilestones, waitableOf } from '../assets/js/milestones.js';
import { project, toNumber } from '../assets/js/projection.js';

const METRICS = ['net', 'worth', 'income', 'expenses', 'invested', 'profit', 'owned', 'debt'];
const run = (months) => (fields) => project({ fields, months });

/** A plan and its targets, normalised the way the app would hand them over. */
function planOf(fields, milestones, months = 240) {
  const targets = normalizeMilestones(milestones, METRICS);
  const ids = new Map(targets.map((one) => [one.name, one.id]));
  // The fixtures name their targets; the fields point at them by id, because
  // that is what a field actually holds.
  const pointed = fields.map((field) => {
    const next = { ...field };
    for (const at of ['startAt', 'endAt', 'sellAt']) {
      if (next[at]) next[at] = ids.get(next[at]) || next[at];
    }
    return next;
  });
  return {
    fields: normalizeFields(pointed), milestones: targets, run: run(months), read: toNumber, ids,
  };
}

test('a plan that waits on nothing is handed straight back', () => {
  // The loop costs a projection per round, so a plan with no target in it must
  // not pay for one. Identity, not equality: the caller's own array comes back.
  const plan = planOf([{ label: 'Rent', amount: '500' }], [{ name: 'Bought', metric: 'owned', amount: '1' }]);
  const out = schedule(plan);
  assert.equal(out.fields, plan.fields, 'the same list, not a copy of it');
  assert.equal(out.rounds, 0, 'and not one projection was run');
  assert.equal(out.settled, true);
  assert.equal(waitsOnAnything(plan.fields), false);
});

test('a purchase waits for the savings, and lands the month they are there', () => {
  // The question the whole feature exists for: 1,000 a month put by, and a
  // 12,000 purchase that happens when the savings cover it. Month 12 is the
  // first month net reaches 12,000, and nothing had to work that out by hand.
  const plan = planOf(
    [
      { label: 'Pay', direction: 'income', amount: '1000' },
      { label: 'The car', kind: 'once', amount: '12000', startAt: 'Saved up' },
    ],
    [{ name: 'Saved up', metric: 'net', amount: '12000' }],
    36,
  );
  const out = schedule(plan);

  assert.equal(out.settled, true, 'the months come to rest');
  assert.equal(out.months.get(plan.ids.get('Saved up')), 12);
  const car = out.fields.find((field) => field.label === 'The car');
  assert.equal(car.startMonth, 12, 'the purchase is placed in the month the target is met');
  assert.equal(waitsOnAnything(plan.fields), true);

  // And the projection built from it actually spends the money there.
  const points = run(36)(out.fields).points;
  assert.equal(points[11].net, 11000, 'the month before, the savings are still whole');
  assert.equal(points[12].net, 0, 'and the month it lands they are spent');
});

test('a target never met leaves what waits on it out of the plan entirely', () => {
  // "Not yet" for a start is not a month at the end of time — it is a field
  // that has not begun, and a field that has not begun contributes nothing and
  // holds no balance. Dropping it says that exactly, with no sentinel month.
  const plan = planOf(
    [
      { label: 'Pay', direction: 'income', amount: '100' },
      { label: 'The yacht', kind: 'once', amount: '9000000', startAt: 'Rich' },
    ],
    [{ name: 'Rich', metric: 'net', amount: '9000000' }],
    36,
  );
  const out = schedule(plan);

  assert.equal(out.months.get(plan.ids.get('Rich')), null, 'the target is never met');
  assert.equal(out.fields.some((field) => field.label === 'The yacht'), false, 'so the purchase is not in the plan');
  assert.equal(out.fields.length, 1);
  assert.equal(run(36)(out.fields).points[36].net, 3600, 'and the money is all still there');
});

test('an ending that never comes is no ending, and a sale that never comes is no sale', () => {
  // The other two directions. A reader who says "rent until I buy" and never
  // buys goes on renting; an investment whose sale never arrives is still held.
  const plan = planOf(
    [
      { label: 'Pay', direction: 'income', amount: '100' },
      { label: 'Rent', amount: '50', endAt: 'Bought' },
      { label: 'Fund', kind: 'investment', amount: '10', annualRate: '5', sellAt: 'Bought' },
    ],
    [{ name: 'Bought', metric: 'owned', amount: '500000' }],
    24,
  );
  const out = schedule(plan);

  assert.equal(out.months.get(plan.ids.get('Bought')), null);
  const rent = out.fields.find((field) => field.label === 'Rent');
  const fund = out.fields.find((field) => field.label === 'Fund');
  assert.equal(rent.endMonth, 0, 'no end');
  assert.equal(fund.sellMonth, 0, 'and never sold');
  assert.ok(run(24)(out.fields).points[24].invested > 0, 'so the holding is still there at the end');
});

test('one target waiting behind another settles, and each sees the one before it', () => {
  // A chain, and the case that proves holding back is done per target rather
  // than for all of them at once. 1,000 a month; the car when savings reach
  // 6,000; the boat when they reach 12,000.
  //
  // The first target is read without the car, so it is month 6. The second is
  // read without the *boat* but WITH the car — the car does not wait on it — so
  // it sees the savings emptied in month 6 and climbing again, and lands on
  // month 18 rather than the month 12 a plan that ignored the car would give.
  // Holding back everything at once would have got this wrong.
  const plan = planOf(
    [
      { label: 'Pay', direction: 'income', amount: '1000' },
      { label: 'The car', kind: 'once', amount: '6000', startAt: 'Six' },
      { label: 'The boat', kind: 'once', amount: '6000', startAt: 'Twelve' },
    ],
    [
      { name: 'Six', metric: 'net', amount: '6000' },
      { name: 'Twelve', metric: 'net', amount: '12000' },
    ],
    48,
  );
  const out = schedule(plan);

  assert.equal(out.settled, true);
  assert.equal(out.months.get(plan.ids.get('Six')), 6, 'the first is met in month 6');
  assert.equal(out.months.get(plan.ids.get('Twelve')), 18,
    'and the second accounts for the first purchase rather than ignoring it');
  assert.equal(out.fields.find((field) => field.label === 'The boat').startMonth, 18);
  assert.ok(out.rounds > 1, `the chain needed more than one round: ${out.rounds}`);
});

test('a target its own purchase would cause answers never, rather than chasing itself', () => {
  // "Buy the house when what I own reaches 100,000", where the house IS what
  // would be owned. Reading the target holds back what waits on it, so the
  // question is put to a plan with no house in it, nothing is owned, and the
  // answer is never. That is a true answer to a question that answers itself —
  // and much better than the two months a chase would have alternated between.
  const plan = planOf(
    [
      { label: 'Pay', direction: 'income', amount: '1000' },
      { label: 'The house', kind: 'asset', amount: '100000', startAt: 'Owning' },
    ],
    [{ name: 'Owning', metric: 'owned', amount: '100000' }],
    120,
  );
  const out = schedule(plan);

  assert.equal(out.settled, true, 'it comes to rest rather than cycling');
  assert.equal(out.months.get(plan.ids.get('Owning')), null, 'and the answer is never');
  assert.equal(out.fields.some((field) => field.label === 'The house'), false);
  // One round, because "never" is where it starts and where it stays. An
  // absent entry and a resolved `null` have to compare equal for this to hold;
  // when they did not, the opening state matched the first answer and a plan
  // that resolved correctly to never was reported as a cycle.
  assert.equal(out.rounds, 1);
});

test('two targets that move each other are refused rather than guessed at', () => {
  // Holding back cannot help when neither target is the one being held: the
  // spending waits on A and moves B, the windfall waits on B and moves A, and
  // each round places them somewhere that moves the other. There is no
  // arrangement that is its own cause, so the loop notices it has been in this
  // state before and says so instead of showing one half of the alternation.
  const plan = planOf(
    [
      { label: 'Pay', direction: 'income', amount: '1000' },
      { label: 'Spend', kind: 'once', amount: '5000', startAt: 'A' },
      {
        label: 'Windfall', kind: 'once', direction: 'income', amount: '3000', startAt: 'B',
      },
    ],
    [
      { name: 'A', metric: 'net', amount: '5000' },
      { name: 'B', metric: 'net', amount: '3000' },
    ],
    120,
  );
  const out = schedule(plan);

  assert.equal(out.settled, false, 'the app says it could not settle');
  assert.ok(out.rounds <= 8, `and stops rather than iterating for ever: ${out.rounds} rounds`);
  // Whatever it hands back is still a well-formed plan the app can draw, so a
  // circular pair degrades to a reading with a warning rather than a broken
  // screen.
  assert.ok(Array.isArray(out.fields));
  assert.doesNotThrow(() => run(120)(out.fields));
});

test('only the targets something waits on are resolved', () => {
  // Six targets are allowed and each costs a read per round. A plan that waits
  // on one of them must not pay to resolve the other five.
  const plan = planOf(
    [
      { label: 'Pay', direction: 'income', amount: '1000' },
      { label: 'The car', kind: 'once', amount: '3000', startAt: 'Three' },
    ],
    [
      { name: 'Three', metric: 'net', amount: '3000' },
      { name: 'Ten', metric: 'net', amount: '10000' },
      { metric: 'worth', amount: '50' },
    ],
    36,
  );
  const out = schedule(plan);
  assert.deepEqual([...out.months.keys()], [plan.ids.get('Three')], 'one target read, not three');
  assert.equal(out.months.get(plan.ids.get('Three')), 3);
});

test('only a named target can be waited on', () => {
  // The menu a field picks from is the named ones. An unnamed target is still
  // read and still drawn; there is simply nothing to refer to it by.
  const targets = normalizeMilestones([
    { name: 'Bought', metric: 'owned', amount: '1' },
    { metric: 'net', amount: '2' },
    { name: '   ', metric: 'net', amount: '3' },
  ], METRICS);
  assert.deepEqual(waitableOf(targets).map((one) => one.name), ['Bought']);
});

test('a field can start on a figure and be sold on a target', () => {
  // The three are separate attributes precisely so this is sayable: put money
  // in from the beginning, and cash it in when the savings cover the house.
  const plan = planOf(
    [
      { label: 'Pay', direction: 'income', amount: '1000' },
      {
        label: 'Fund', kind: 'investment', amount: '100', annualRate: '6', startMonth: 1, sellAt: 'Ready',
      },
    ],
    [{ name: 'Ready', metric: 'net', amount: '5000' }],
    60,
  );
  const out = schedule(plan);
  const fund = out.fields.find((field) => field.label === 'Fund');

  assert.equal(out.settled, true);
  assert.equal(fund.startMonth, 1, 'the figure it was given stands');
  assert.equal(fund.sellMonth, out.months.get(plan.ids.get('Ready')), 'and the sale takes the target');
  assert.ok(fund.sellMonth > 1, `sold after it was started: month ${fund.sellMonth}`);
});
