import test from 'node:test';
import assert from 'node:assert/strict';

import {
  project, seriesOf, extentOf, toAmount, toMonths, roundMoney, MAX_MONTHS, MAX_AMOUNT,
} from '../assets/js/projection.js';

test('a horizon of N months yields N + 1 points, starting at zero', () => {
  const result = project({ monthlyIncome: 3000, monthlyRent: 1200, months: 24 });
  assert.equal(result.points.length, 25);
  assert.deepEqual(result.points[0], { month: 0, income: 0, expenses: 0, net: 0 });
});

test('each series accumulates its monthly amount', () => {
  const { points } = project({ monthlyIncome: 3000, monthlyRent: 1200, months: 3 });
  assert.deepEqual(points.map((p) => p.income), [0, 3000, 6000, 9000]);
  assert.deepEqual(points.map((p) => p.expenses), [0, 1200, 2400, 3600]);
  assert.deepEqual(points.map((p) => p.net), [0, 1800, 3600, 5400]);
});

test('net equals income minus expenses at every point', () => {
  const { points } = project({ monthlyIncome: 2750.55, monthlyRent: 1399.99, months: 36 });
  for (const point of points) {
    assert.equal(point.net, roundMoney(point.income - point.expenses));
  }
});

test('rent above income produces a falling net', () => {
  const result = project({ monthlyIncome: 1000, monthlyRent: 1500, months: 4 });
  assert.equal(result.monthlyNet, -500);
  assert.deepEqual(result.points.map((p) => p.net), [0, -500, -1000, -1500, -2000]);
  assert.equal(result.totals.net, -2000);
  assert.equal(result.breakEvenMonth, null);
});

test('totals match the last point', () => {
  const result = project({ monthlyIncome: 4200, monthlyRent: 1750, months: 60 });
  const last = result.points[result.points.length - 1];
  assert.deepEqual(result.totals, { income: last.income, expenses: last.expenses, net: last.net });
  assert.equal(result.totals.income, 4200 * 60);
});

test('cents survive without float drift', () => {
  const { points } = project({ monthlyIncome: 0.1, monthlyRent: 0, months: 3 });
  assert.deepEqual(points.map((p) => p.income), [0, 0.1, 0.2, 0.3]);
});

test('amounts coerce: strings in, non-negative numbers out', () => {
  assert.equal(toAmount('2500.50'), 2500.5);
  assert.equal(toAmount('12.345'), 12.35);
  assert.equal(toAmount(''), 0);
  assert.equal(toAmount('abc'), 0);
  assert.equal(toAmount(-40), 0);
  assert.equal(toAmount(null), 0);
  assert.equal(toAmount(undefined), 0);
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

test('an empty projection is all zeroes, not NaN', () => {
  const result = project();
  assert.equal(result.monthlyIncome, 0);
  assert.equal(result.monthlyRent, 0);
  assert.equal(result.months, 1);
  assert.deepEqual(result.totals, { income: 0, expenses: 0, net: 0 });
});

test('seriesOf pulls one key out as {month, value}', () => {
  const result = project({ monthlyIncome: 100, monthlyRent: 40, months: 2 });
  assert.deepEqual(seriesOf(result, 'expenses'), [
    { month: 0, value: 0 }, { month: 1, value: 40 }, { month: 2, value: 80 },
  ]);
});

test('extentOf spans every series and always includes zero', () => {
  const result = project({ monthlyIncome: 1000, monthlyRent: 1500, months: 3 });
  const extent = extentOf(['income', 'expenses', 'net'].map((key) => seriesOf(result, key)));
  assert.equal(extent.min, -1500);
  assert.equal(extent.max, 4500);
  assert.deepEqual(extentOf([[{ month: 0, value: 5 }]]), { min: 0, max: 5 });
});

test('absurd amounts are capped where doubles stop counting cents', () => {
  assert.equal(toAmount(1e21), MAX_AMOUNT);
  assert.equal(toAmount('9e99'), MAX_AMOUNT);
  assert.equal(toAmount(MAX_AMOUNT + 1), MAX_AMOUNT);
  const capped = project({ monthlyIncome: 1e21, monthlyRent: 0, months: 2 });
  assert.deepEqual(capped.points.map((p) => p.income), [0, MAX_AMOUNT, MAX_AMOUNT * 2]);
});

test('the worst-case projection still counts in whole cents', () => {
  const worst = project({ monthlyIncome: MAX_AMOUNT, monthlyRent: 0, months: MAX_MONTHS });
  assert.ok(Number.isSafeInteger(worst.totals.income * 100));
  assert.equal(worst.totals.income, MAX_AMOUNT * MAX_MONTHS);
});
