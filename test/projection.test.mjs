import test from 'node:test';
import assert from 'node:assert/strict';

import {
  project, seriesOf, extentOf, hasAmounts, flowIn, contributionOf,
  toAmount, toMonths, roundMoney, MAX_MONTHS, MAX_AMOUNT,
} from '../assets/js/projection.js';
import { createField, normalizeFields } from '../assets/js/fields.js';

const income = (amount) => createField({ direction: 'income', amount });
const expense = (amount) => createField({ direction: 'expense', amount });

test('a horizon of N months yields N + 1 points, starting at zero', () => {
  const result = project({ fields: [income(3000), expense(1200)], months: 24 });
  assert.equal(result.points.length, 25);
  assert.deepEqual(result.points[0], { month: 0, income: 0, expenses: 0, net: 0 });
});

test('each series accumulates every field pointing that way', () => {
  const { points } = project({
    fields: [income(3000), income(500), expense(1200), expense(300)],
    months: 3,
  });
  assert.deepEqual(points.map((p) => p.income), [0, 3500, 7000, 10500]);
  assert.deepEqual(points.map((p) => p.expenses), [0, 1500, 3000, 4500]);
  assert.deepEqual(points.map((p) => p.net), [0, 2000, 4000, 6000]);
});

test('net equals income minus expenses at every point', () => {
  const { points } = project({
    fields: [income(2750.55), income(120.4), expense(1399.99), expense(45.5)],
    months: 36,
  });
  for (const point of points) {
    assert.equal(point.net, roundMoney(point.income - point.expenses));
  }
});

test('expenses above income produce a falling net', () => {
  const result = project({ fields: [income(1000), expense(900), expense(600)], months: 4 });
  assert.equal(result.averages.net, -500);
  assert.deepEqual(result.points.map((p) => p.net), [0, -500, -1000, -1500, -2000]);
  assert.equal(result.totals.net, -2000);
});

test('totals match the last point', () => {
  const result = project({ fields: [income(4200), expense(1750)], months: 60 });
  const last = result.points[result.points.length - 1];
  assert.deepEqual(result.totals, { income: last.income, expenses: last.expenses, net: last.net });
  assert.equal(result.totals.income, 4200 * 60);
});

test('cents survive without float drift', () => {
  const { points } = project({ fields: [income(0.1)], months: 3 });
  assert.deepEqual(points.map((p) => p.income), [0, 0.1, 0.2, 0.3]);
});

test('a field with no amount contributes nothing', () => {
  const result = project({ fields: [income(3000), income(''), expense('')], months: 12 });
  assert.equal(result.averages.income, 3000);
  assert.equal(result.averages.expenses, 0);
});

test('garbage in the field list cannot reach the numbers', () => {
  const result = project({ fields: [null, 'nope', { direction: 'income', amount: 'abc' }, income(100)], months: 6 });
  assert.equal(result.averages.income, 100);
  assert.equal(result.averages.expenses, 0);
  assert.equal(result.fields.length, 4, 'unusable entries still become fields the reader can fix');
});

test('an empty projection is all zeroes, not NaN', () => {
  const result = project();
  assert.equal(result.averages.income, 0);
  assert.equal(result.averages.expenses, 0);
  assert.equal(result.months, 1);
  assert.deepEqual(result.totals, { income: 0, expenses: 0, net: 0 });
  assert.equal(hasAmounts(result), false);
});

test('the app knows when there is something to draw', () => {
  assert.equal(hasAmounts(project({ fields: [income(1)], months: 1 })), true);
  assert.equal(hasAmounts(project({ fields: [expense(1)], months: 1 })), true);
  assert.equal(hasAmounts(project({ fields: [income(0), expense('')], months: 1 })), false);
});

test('amounts coerce: strings in, non-negative numbers out', () => {
  assert.equal(toAmount('2500.50'), 2500.5);
  assert.equal(toAmount('12.345'), 12.35);
  assert.equal(toAmount(''), 0);
  assert.equal(toAmount('abc'), 0);
  assert.equal(toAmount(-40), 0);
  assert.equal(toAmount(null), 0);
  assert.equal(toAmount(Infinity), 0);
});

test('months clamp to the supported range', () => {
  assert.equal(toMonths(0), 1);
  assert.equal(toMonths(-12), 1);
  assert.equal(toMonths('24'), 24);
  assert.equal(toMonths(18.9), 18);
  assert.equal(toMonths(99999), MAX_MONTHS);
  assert.equal(toMonths('nope'), 1);
  assert.equal(project({ months: 5000 }).points.length, MAX_MONTHS + 1);
});

test('absurd amounts are capped where doubles stop counting cents', () => {
  assert.equal(toAmount(1e21), MAX_AMOUNT);
  assert.equal(toAmount('9e99'), MAX_AMOUNT);
  assert.equal(toAmount(MAX_AMOUNT + 1), MAX_AMOUNT);
});

test('the cap holds for a direction as a whole, not just one field', () => {
  const many = Array.from({ length: 40 }, () => income(MAX_AMOUNT));
  assert.equal(flowIn(normalizeFields(many), 'income', 1), MAX_AMOUNT);

  const worst = project({ fields: many, months: MAX_MONTHS });
  assert.ok(Number.isSafeInteger(worst.totals.income * 100), 'totals stay exact to the cent');
  assert.equal(worst.totals.income, MAX_AMOUNT * MAX_MONTHS);
});

test('a field contributes the same amount every month, for now', () => {
  const field = income('1200');
  assert.equal(contributionOf(field, 1), 1200);
  assert.equal(contributionOf(field, 600), 1200);
  assert.equal(contributionOf(income(''), 1), 0);
});

test('seriesOf pulls one key out as {month, value}', () => {
  const result = project({ fields: [income(100), expense(40)], months: 2 });
  assert.deepEqual(seriesOf(result, 'expenses'), [
    { month: 0, value: 0 }, { month: 1, value: 40 }, { month: 2, value: 80 },
  ]);
});

test('extentOf spans every series and always includes zero', () => {
  const result = project({ fields: [income(1000), expense(1500)], months: 3 });
  const extent = extentOf(['income', 'expenses', 'net'].map((key) => seriesOf(result, key)));
  assert.equal(extent.min, -1500);
  assert.equal(extent.max, 4500);
  assert.deepEqual(extentOf([[{ month: 0, value: 5 }]]), { min: 0, max: 5 });
});

/* ------------------------------------------------------- how often it lands */

const yearly = (amount) => createField({ direction: 'expense', amount, periodMonths: 12 });

test('a yearly amount lands at the end of each year, not every month', () => {
  const { points } = project({ fields: [yearly(1200)], months: 26 });
  const paid = points.filter((p) => p.expenses > (points[p.month - 1] || { expenses: 0 }).expenses);
  assert.deepEqual(paid.map((p) => p.month), [12, 24]);
  assert.equal(points[11].expenses, 0, 'nothing has landed by month 11');
  assert.equal(points[12].expenses, 1200);
  assert.equal(points[23].expenses, 1200, 'and nothing more until the next year');
  assert.equal(points[24].expenses, 2400);
});

test('every period lands on its own beat', () => {
  // Read the landings out of the curve rather than restating the rule.
  const landings = (periodMonths) => {
    const { points } = project({
      fields: [createField({ direction: 'expense', amount: '100', periodMonths })],
      months: 12,
    });
    return points.filter((p) => p.month > 0 && p.expenses > points[p.month - 1].expenses).map((p) => p.month);
  };

  assert.deepEqual(landings(1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(landings(3), [3, 6, 9, 12]);
  assert.deepEqual(landings(6), [6, 12]);
  assert.deepEqual(landings(12), [12]);
});

test('a total is the amount times the number of times it actually landed', () => {
  for (const [periodMonths, months, times] of [[1, 24, 24], [3, 24, 8], [6, 24, 4], [12, 24, 2], [12, 30, 2], [3, 5, 1]]) {
    const result = project({
      fields: [createField({ direction: 'expense', amount: '600', periodMonths })],
      months,
    });
    assert.equal(result.totals.expenses, 600 * times, `${periodMonths}-monthly over ${months} months`);
  }
});

test('periods and monthly amounts add up together', () => {
  const result = project({
    fields: [income(3400), expense(1250), yearly(1440), createField({ direction: 'expense', amount: '900', periodMonths: 3 })],
    months: 60,
  });
  assert.equal(result.totals.income, 204000);
  assert.equal(result.totals.expenses, 1250 * 60 + 1440 * 5 + 900 * 20);
  assert.equal(result.totals.net, 103800);
  assert.equal(result.averages.net, 1730);
});

test('an unreadable period reads as monthly rather than as nothing', () => {
  const result = project({
    fields: [createField({ direction: 'expense', amount: '50', periodMonths: 'yearly' })],
    months: 4,
  });
  assert.equal(result.totals.expenses, 200);
});

test('an amount is worth showing even when nothing lands inside the horizon', () => {
  const result = project({ fields: [yearly(1200)], months: 6 });
  assert.equal(result.totals.expenses, 0);
  assert.equal(hasAmounts(result), true, 'the reader typed something; show them the charts');
});

test('contributionOf answers for one field and one month', () => {
  const field = yearly(1200);
  assert.equal(contributionOf(field, 11), 0);
  assert.equal(contributionOf(field, 12), 1200);
  assert.equal(contributionOf(field, 24), 1200);
  assert.equal(contributionOf(createField({ direction: 'expense', amount: '10' }), 7), 10);
});

test('the per-month cap holds whatever the period', () => {
  const many = Array.from({ length: 40 }, () => createField({
    direction: 'income', amount: MAX_AMOUNT, periodMonths: 12,
  }));
  const worst = project({ fields: many, months: MAX_MONTHS });
  assert.ok(Number.isSafeInteger(worst.totals.income * 100), 'totals stay exact to the cent');
  assert.equal(worst.totals.income, MAX_AMOUNT * 50, 'capped per month, landing 50 times');
});
