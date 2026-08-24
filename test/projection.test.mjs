import test from 'node:test';
import assert from 'node:assert/strict';

import {
  project, seriesOf, extentOf, hasAmounts, monthlyFlow,
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
  assert.equal(result.monthlyNet, -500);
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
  assert.equal(result.monthlyIncome, 3000);
  assert.equal(result.monthlyExpenses, 0);
});

test('garbage in the field list cannot reach the numbers', () => {
  const result = project({ fields: [null, 'nope', { direction: 'income', amount: 'abc' }, income(100)], months: 6 });
  assert.equal(result.monthlyIncome, 100);
  assert.equal(result.monthlyExpenses, 0);
  assert.equal(result.fields.length, 4, 'unusable entries still become fields the reader can fix');
});

test('an empty projection is all zeroes, not NaN', () => {
  const result = project();
  assert.equal(result.monthlyIncome, 0);
  assert.equal(result.monthlyExpenses, 0);
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
  assert.equal(monthlyFlow(normalizeFields(many), 'income'), MAX_AMOUNT);

  const worst = project({ fields: many, months: MAX_MONTHS });
  assert.ok(Number.isSafeInteger(worst.totals.income * 100), 'totals stay exact to the cent');
  assert.equal(worst.totals.income, MAX_AMOUNT * MAX_MONTHS);
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
