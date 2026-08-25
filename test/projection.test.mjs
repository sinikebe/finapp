import test from 'node:test';
import assert from 'node:assert/strict';

import {
  project, inTodaysMoney, shiftReturns, monthlyGrowth, afterTax,
  seriesOf, extentOf, hasAmounts, hasInvestments, hasDebt, hasOwned,
  flowIn, contributionOf, outstandingOf, startOf, firstPaymentOf, drawMonthOf,
  grownBy, yearsRunning,
  loanPayment, loanInterest, monthlyRate,
  toAmount, toMonths, roundMoney, MAX_MONTHS, MAX_AMOUNT,
} from '../assets/js/projection.js';
import { createField, normalizeFields } from '../assets/js/fields.js';

const income = (amount) => createField({ direction: 'income', amount });
const expense = (amount) => createField({ direction: 'expense', amount });

test('a horizon of N months yields N + 1 points, starting at zero', () => {
  const result = project({ fields: [income(3000), expense(1200)], months: 24 });
  assert.equal(result.points.length, 25);
  assert.deepEqual(result.points[0], {
    month: 0,
    income: 0,
    expenses: 0,
    net: 0,
    invested: 0,
    contributed: 0,
    profit: 0,
    owned: 0,
    debt: 0,
    worth: 0,
  }, 'every series starts at nothing');
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
  assert.deepEqual(result.totals, {
    income: last.income,
    expenses: last.expenses,
    net: last.net,
    invested: last.invested,
    contributed: last.contributed,
    profit: last.profit,
    owned: last.owned,
    debt: last.debt,
    worth: last.worth,
  });
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
  assert.deepEqual(result.totals, {
    income: 0,
    expenses: 0,
    net: 0,
    invested: 0,
    contributed: 0,
    profit: 0,
    owned: 0,
    debt: 0,
    worth: 0,
  });
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

/* --------------------------------------------------------------- borrowing */

const loan = (amount, annualRate, termMonths, direction = 'expense') => createField({
  kind: 'loan', direction, amount, annualRate, termMonths,
});

test('a loan repays what was borrowed, interest included', () => {
  // The textbook case: 200,000 over 25 years at 4.5% is 1,111.66 a month.
  assert.equal(loanPayment('200000', '4.5', 300), 1111.66);
  assert.equal(loanPayment('18000', '5.9', 48), 421.91);
});

test('at 0% a loan is simply the amount split evenly', () => {
  assert.equal(loanPayment('1200', '0', 12), 100);
  assert.equal(loanPayment('1200', '', 12), 100);
  assert.equal(loanPayment('1000', 'nonsense', 4), 250);
});

test('a loan pays every month of its term and nothing after', () => {
  const field = loan('12000', '0', 24);
  assert.equal(contributionOf(field, 1), 500);
  assert.equal(contributionOf(field, 24), 500);
  assert.equal(contributionOf(field, 25), 0);

  const result = project({ fields: [field], months: 36 });
  assert.equal(result.totals.expenses, 12000, 'the whole loan, and no more');
  assert.equal(result.points[24].expenses, 12000);
  assert.equal(result.points[36].expenses, 12000);
});

test('interest is what a loan costs beyond what was borrowed', () => {
  assert.equal(loanInterest(loan('12000', '0', 24)), 0);
  const borrowed = loan('18000', '5.9', 48);
  assert.equal(loanInterest(borrowed), roundMoney(421.91 * 48 - 18000));
});

test('a loan ignores the period control: repayments are monthly', () => {
  const field = createField({
    kind: 'loan', direction: 'expense', amount: '1200', annualRate: '0', termMonths: 12, periodMonths: 12,
  });
  assert.equal(field.periodMonths, 1, 'the model settles it, whatever was stored');
  assert.equal(contributionOf(field, 1), 100);
});

test('a loan can point either way: repaying one, or being repaid', () => {
  const lent = createField({ kind: 'loan', direction: 'income', amount: '6000', annualRate: '0', termMonths: 12 });
  const result = project({ fields: [lent], months: 12 });
  assert.equal(result.totals.income, 6000);
  assert.equal(result.totals.expenses, 0);
});

/* -------------------------------------------------------------- investing */

const invest = (amount, annualRate, periodMonths = 1) => createField({
  kind: 'investment', amount, annualRate, periodMonths,
});

test('money invested leaves the account like any other outgoing', () => {
  const result = project({ fields: [invest('500', '7')], months: 12 });
  assert.equal(result.totals.expenses, 6000, 'contributions are money out');
  assert.equal(result.totals.income, 0);
});

test('an investment is worth its contributions plus their growth', () => {
  const result = project({ fields: [invest('500', '7')], months: 120 });
  // The closed form for a monthly contribution compounding monthly, allowing
  // for this model rounding each month's balance to the cent.
  const rate = 0.07 / 12;
  const closedForm = 500 * (((1 + rate) ** 120 - 1) / rate);
  assert.ok(Math.abs(result.totals.invested - closedForm) < 1, `${result.totals.invested} vs ${closedForm}`);
  assert.ok(result.totals.invested > result.totals.expenses, 'growth is on top of what went in');
});

test('at 0% an investment is worth exactly what was put in', () => {
  const result = project({ fields: [invest('100', '0')], months: 24 });
  assert.equal(result.totals.invested, 2400);
  assert.equal(result.totals.invested, result.totals.expenses);
});

test('an investment can be fed less often than monthly', () => {
  const result = project({ fields: [invest('1200', '0', 12)], months: 36 });
  assert.equal(result.totals.expenses, 3600, 'three contributions, at months 12, 24 and 36');
  assert.equal(result.points[11].invested, 0);
  assert.equal(result.points[12].invested, 1200);
});

test('a fresh contribution has not had time to earn yet', () => {
  const result = project({ fields: [invest('100', '12')], months: 2 });
  assert.equal(result.points[1].invested, 100, 'the first month is just the money');
  // Month two: the first 100 earns 1% for a month, then 100 more goes in.
  assert.equal(result.points[2].invested, 201);
});

test('each investment grows at its own rate', () => {
  const result = project({ fields: [invest('100', '0'), invest('100', '12')], months: 12 });
  const flat = project({ fields: [invest('100', '0')], months: 12 }).totals.invested;
  const growing = project({ fields: [invest('100', '12')], months: 12 }).totals.invested;
  assert.equal(result.totals.invested, roundMoney(flat + growing));
});

test('the app knows when a balance is worth its own chart', () => {
  assert.equal(hasInvestments(project({ fields: [invest('500', '7')], months: 12 })), true);
  assert.equal(hasInvestments(project({ fields: [invest('', '7')], months: 12 })), false, 'nothing invested yet');
  assert.equal(hasInvestments(project({ fields: [income(500)], months: 12 })), false);
});

test('a rate is coerced, never trusted', () => {
  assert.equal(monthlyRate('12'), 0.01);
  assert.equal(monthlyRate(''), 0);
  assert.equal(monthlyRate('-5'), 0);
  assert.equal(monthlyRate('abc'), 0);
  assert.equal(monthlyRate('99999'), 1000 / 100 / 12, 'absurd rates are capped, not carried');
});

test('loans and investments add up with everything else', () => {
  const result = project({
    fields: [income(4200), expense(1200), loan('18000', '5.9', 48), invest('500', '7')],
    months: 120,
  });
  assert.equal(result.totals.income, 504000);
  assert.equal(result.totals.expenses, roundMoney(1200 * 120 + 421.91 * 48 + 500 * 120));
  assert.equal(result.totals.net, roundMoney(result.totals.income - result.totals.expenses));
  assert.ok(result.totals.invested > 86000 && result.totals.invested < 87000);
});

/* ----------------------------------------------------------- total worth */

test('with nothing invested the total is the net, to the cent', () => {
  const result = project({ fields: [income(3210.55), expense(1499.99)], months: 36 });
  for (const point of result.points) {
    assert.equal(point.worth, point.net, `month ${point.month}`);
  }
  assert.equal(result.totals.worth, result.totals.net);
});

test('the total is the cash kept plus what the investments are worth', () => {
  const result = project({ fields: [income(2000), invest('500', '6')], months: 48 });
  for (const point of result.points) {
    assert.equal(point.worth, roundMoney(point.net + point.invested), `month ${point.month}`);
  }
  assert.equal(result.totals.worth, roundMoney(result.totals.net + result.totals.invested));
});

test('investing does not destroy money: the total beats never investing', () => {
  // The same 500 a month, once put to work at 6% and once simply kept as cash.
  const invested = project({ fields: [income(2000), invest('500', '6')], months: 120 });
  const kept = project({ fields: [income(2000)], months: 120 });
  assert.ok(
    invested.totals.worth > kept.totals.worth,
    `${invested.totals.worth} should beat ${kept.totals.worth}`,
  );
  // ...while the cash actually in hand is lower, which is the whole point of
  // charting the total beside the net.
  assert.ok(invested.totals.net < kept.totals.net);
});

test('the total never falls below the money actually invested', () => {
  const result = project({ fields: [income(1000), invest('250', '0')], months: 24 });
  assert.equal(result.totals.invested, 6000, 'no growth at 0%');
  assert.equal(result.totals.worth, result.totals.income - result.totals.expenses + 6000);
  assert.equal(result.totals.worth, 24000, 'the contributions come back into the total');
});

test('a lumpy investment moves the total only when it lands', () => {
  const result = project({ fields: [invest('1200', '0', 12)], months: 24 });
  assert.equal(result.points[11].worth, 0, 'nothing has moved yet');
  assert.equal(result.points[12].worth, 0, 'paid out and invested in the same month');
  assert.equal(result.points[24].worth, 0);
  assert.equal(result.points[24].invested, 2400);
  assert.equal(result.points[24].net, -2400);
});

/* -------------------------------------------------------- owning and owing */

const asset = (amount, annualRate = '') => createField({ kind: 'asset', amount, annualRate });

test('an asset moves no cash at all', () => {
  const result = project({ fields: [asset('250000', '2')], months: 12 });
  assert.equal(result.totals.income, 0);
  assert.equal(result.totals.expenses, 0);
  assert.equal(result.totals.net, 0);
  assert.equal(contributionOf(asset('250000'), 1), 0);
});

test('the balance sheet starts at what you already own and owe', () => {
  const result = project({ fields: [asset('250000'), loan('200000', '3', 240)], months: 60 });
  const [start] = result.points;
  assert.equal(start.owned, 250000, 'you already own it');
  assert.equal(start.debt, 200000, 'and already owe it');
  assert.equal(start.worth, 50000, 'net worth today is the difference');
  assert.equal(start.net, 0, 'the flows still start at nothing');
});

test('what is still owed falls to nothing across the term', () => {
  const field = loan('200000', '3', 240);
  assert.equal(outstandingOf(field, 0), 200000);
  assert.ok(outstandingOf(field, 120) < 200000, 'it comes down');
  assert.ok(outstandingOf(field, 120) > 100000, 'but slowly at first — that is amortisation');
  assert.equal(outstandingOf(field, 240), 0, 'cleared by the last payment');
  assert.equal(outstandingOf(field, 300), 0, 'and stays cleared');
});

test('a repayment costs you only its interest, not the whole payment', () => {
  // Clearing principal moves cash and debt by the same amount, so the only
  // thing that leaves for good is the interest.
  const field = loan('120000', '6', 120);
  const result = project({ fields: [field], months: 120 });
  const drop = roundMoney(result.points[0].worth - result.points[120].worth);
  assert.equal(drop, loanInterest(field), 'the whole cost is the interest');
  // ...and paying the full payment against worth would be this much worse.
  assert.ok(result.totals.expenses > drop, 'payments far exceed the true cost');
});

test('a loan pointing the other way is something you own, not something you owe', () => {
  const result = project({ fields: [loan('10000', '5', 24, 'income')], months: 24 });
  assert.equal(result.points[0].debt, 0, 'you owe nothing');
  assert.equal(result.points[0].owned, 10000, 'you are owed it');
  assert.ok(result.totals.income > 10000, 'repaid with interest');
});

test('an asset appreciates, and does so on its own rate', () => {
  const flat = project({ fields: [asset('100000')], months: 120 });
  const rising = project({ fields: [asset('100000', '3')], months: 120 });
  assert.equal(flat.totals.owned, 100000, 'no rate, no growth');
  assert.ok(rising.totals.owned > 134000 && rising.totals.owned < 136000, rising.totals.owned);
});

test('worth is the whole balance sheet, every month', () => {
  const result = project({
    fields: [income(4000), expense(1200), invest('500', '6'), asset('250000', '2'), loan('200000', '3', 240)],
    months: 240,
  });
  for (const p of result.points) {
    assert.equal(p.worth, roundMoney(p.net + p.invested + p.owned - p.debt), `month ${p.month}`);
  }
});

test('the app knows what is owned and what is owed', () => {
  assert.equal(hasDebt(project({ fields: [loan('1000', '3', 12)] })), true);
  assert.equal(hasDebt(project({ fields: [loan('1000', '3', 12, 'income')] })), false, 'lending is not owing');
  assert.equal(hasDebt(project({ fields: [loan('', '3', 12)] })), false, 'nothing borrowed yet');
  assert.equal(hasOwned(project({ fields: [asset('1000')] })), true);
  assert.equal(hasOwned(project({ fields: [loan('1000', '3', 12, 'income')] })), true, 'being owed counts');
  assert.equal(hasOwned(project({ fields: [income(1000)] })), false);
});

/* --------------------------------------------------------- today's money */

test('restating divides every figure by the same month\'s deflator', () => {
  const nominal = project({ fields: [income(3000)], months: 120 });
  const real = inTodaysMoney(nominal, '2');
  const rate = 0.02 / 12;
  assert.equal(real.totals.net, roundMoney(nominal.totals.net / (1 + rate) ** 120));
  assert.equal(real.points[60].income, roundMoney(nominal.points[60].income / (1 + rate) ** 60));
  assert.equal(real.points[0].income, 0, 'today is today');
});

test('restating leaves every identity in the model standing', () => {
  const nominal = project({
    fields: [income(4000), expense(1200), invest('500', '6'), asset('200000', '2'), loan('150000', '3', 180)],
    months: 180,
  });
  const real = inTodaysMoney(nominal, '2.5');
  for (const p of real.points) {
    assert.equal(p.net, roundMoney(p.income - p.expenses), `net at month ${p.month}`);
    assert.equal(p.worth, roundMoney(p.net + p.invested + p.owned - p.debt), `worth at month ${p.month}`);
  }
});

test('no inflation is not a transformation at all', () => {
  const nominal = project({ fields: [income(1000)], months: 12 });
  assert.equal(inTodaysMoney(nominal, '0'), nominal);
  assert.equal(inTodaysMoney(nominal, ''), nominal);
});

test('restating carries the fields through untouched', () => {
  const nominal = project({ fields: [income(1000)], months: 12 });
  const real = inTodaysMoney(nominal, '3');
  assert.deepEqual(real.fields, nominal.fields, 'the plan itself did not change');
  assert.equal(real.months, nominal.months);
});

/* ------------------------------------------------------------- a range */

test('a shift moves returns and leaves loan interest alone', () => {
  const fields = [invest('500', '7'), asset('100000', '2'), loan('50000', '4', 60), income(3000)];
  const lower = shiftReturns(fields, -3);
  assert.equal(lower[0].annualRate, '4', 'the investment');
  assert.equal(lower[1].annualRate, '-1', 'the asset');
  assert.equal(lower[2].annualRate, '4', 'the loan was agreed, not guessed');
  assert.equal(lower[3].annualRate, fields[3].annualRate, 'a plain field has no return to move');
});

test('a shift of nothing is the same list', () => {
  const fields = [invest('500', '7')];
  assert.equal(shiftReturns(fields, 0), fields);
  assert.equal(shiftReturns(fields, ''), fields);
});

test('growth can be negative, so a bad run really loses money', () => {
  assert.ok(monthlyGrowth('-6') < 0, 'a loss is a loss');
  assert.equal(monthlyGrowth(''), 0);
  const paid = 1000 * 120;
  const bad = project({ fields: shiftReturns([invest('1000', '2')], -8), months: 120 });
  assert.ok(bad.totals.invested < paid, `${bad.totals.invested} should be under the ${paid} paid in`);
  assert.ok(bad.totals.invested > 0, 'but not wiped out');
});

test('the pessimistic run is never above the hopeful one', () => {
  const fields = [income(3000), invest('600', '6')];
  const low = project({ fields: shiftReturns(fields, -4), months: 240 });
  const high = project({ fields: shiftReturns(fields, 4), months: 240 });
  const mid = project({ fields, months: 240 });
  for (let m = 0; m <= 240; m += 1) {
    assert.ok(low.points[m].worth <= mid.points[m].worth, `low ≤ mid at ${m}`);
    assert.ok(mid.points[m].worth <= high.points[m].worth, `mid ≤ high at ${m}`);
  }
});

/* ------------------------------------------------ paid in, and what it made */

test('what was paid in is tracked apart from what it became', () => {
  const result = project({ fields: [invest('500', '7')], months: 120 });
  assert.equal(result.totals.contributed, 60000, '500 a month for 120 months');
  assert.ok(result.totals.invested > result.totals.contributed, 'and it grew');
  assert.equal(result.points[1].contributed, 500, 'the first month is just the money');
  assert.equal(result.points[0].contributed, 0);
});

test('only investments count as paid in', () => {
  const result = project({
    fields: [expense(900), loan('10000', '4', 24), asset('50000'), invest('200', '5')],
    months: 24,
  });
  assert.equal(result.totals.contributed, 4800, 'the rent and the loan are not investing');
});

test('a lumpy investment is paid in only when it lands', () => {
  const result = project({ fields: [invest('1200', '0', 12)], months: 24 });
  assert.equal(result.points[11].contributed, 0);
  assert.equal(result.points[12].contributed, 1200);
  assert.equal(result.points[24].contributed, 2400);
});

test('profit is the gain, less its tax', () => {
  const result = project({ fields: [invest('500', '7')], months: 120, taxRate: 30 });
  const gain = roundMoney(result.totals.invested - result.totals.contributed);
  assert.equal(result.totals.profit, roundMoney(gain * 0.7));
  assert.ok(result.totals.profit < gain, 'the taxman took a cut');
});

test('no rate means no tax, so profit is the whole gain', () => {
  const result = project({ fields: [invest('500', '7')], months: 120 });
  assert.equal(result.totals.profit, roundMoney(result.totals.invested - result.totals.contributed));
});

test('a loss is not taxed, and is never handed back as a credit', () => {
  const losing = shiftReturns([invest('1000', '2')], -8);
  const result = project({ fields: losing, months: 120, taxRate: 30 });
  const gain = roundMoney(result.totals.invested - result.totals.contributed);
  assert.ok(gain < 0, 'this run really lost money');
  assert.equal(result.totals.profit, gain, 'the loss stands, untouched');
  assert.equal(afterTax(-1000, 30), -1000);
  assert.equal(afterTax(0, 30), 0);
});

test('a tax rate is coerced, never trusted', () => {
  assert.equal(afterTax(1000, 'nonsense'), 1000, 'unreadable means untaxed');
  assert.equal(afterTax(1000, -50), 1000, 'no negative tax');
  assert.equal(afterTax(1000, 200), 0, 'and never more than all of it');
  assert.equal(afterTax(1000, 100), 0);
});

test('profit survives being restated in today\'s money', () => {
  const nominal = project({ fields: [invest('500', '7')], months: 120, taxRate: 30 });
  const real = inTodaysMoney(nominal, '2');
  const gain = roundMoney(real.totals.invested - real.totals.contributed);
  assert.equal(real.totals.profit, roundMoney(gain * 0.7), 'still the gain on screen, less its tax');
  assert.ok(real.totals.profit < nominal.totals.profit, 'and worth less than it looked');
});

/* ------------------------------------------------- when a field is running */

const once = (amount, startMonth, direction = 'expense') => createField({
  kind: 'once', direction, amount, startMonth,
});
const between = (amount, startMonth, endMonth, periodMonths = 1) => createField({
  direction: 'expense', amount, startMonth, endMonth, periodMonths,
});

test('a one-off lands in its month and in no other', () => {
  const car = once('25000', 18);
  assert.equal(contributionOf(car, 17), 0);
  assert.equal(contributionOf(car, 18), 25000);
  assert.equal(contributionOf(car, 19), 0);
  const result = project({ fields: [income(3000), car], months: 36 });
  assert.equal(result.totals.expenses, 25000, 'paid exactly once');
  assert.equal(result.points[17].expenses, 0);
  assert.equal(result.points[18].expenses, 25000);
});

test('a one-off always has a real month to land in', () => {
  // Month 0 is today and nothing lands there, so an unset month reads as the first.
  assert.equal(createField({ kind: 'once', amount: '10' }).startMonth, 1);
  assert.equal(createField({ kind: 'once', amount: '10', startMonth: 0 }).startMonth, 1);
  assert.equal(createField({ kind: 'once', amount: '10', startMonth: -5 }).startMonth, 1);
});

test('a window starts and stops a field', () => {
  const rent = between('1200', 4, 9);
  assert.deepEqual([3, 4, 5, 9, 10].map((m) => contributionOf(rent, m)), [0, 1200, 1200, 1200, 0]);
  const result = project({ fields: [rent], months: 24 });
  assert.equal(result.totals.expenses, 1200 * 6, 'months 4 to 9 inclusive');
});

test('a period is counted from the start, not from the calendar', () => {
  const shifted = between('600', 3, 0, 12);
  assert.deepEqual([3, 12, 14, 15, 27].map((m) => contributionOf(shifted, m)), [600, 0, 0, 600, 600]);
});

test('a field with no window behaves exactly as it always did', () => {
  const plain = createField({ direction: 'expense', amount: '900' });
  assert.equal(startOf(plain), 0, 'from the beginning');
  assert.deepEqual([1, 2, 60].map((m) => contributionOf(plain, m)), [900, 900, 900]);
  assert.deepEqual([11, 12, 13, 24].map((m) => contributionOf(yearly('600'), m)), [0, 600, 0, 600]);
});

test('an end before the beginning is read as landing once', () => {
  const odd = between('500', 10, 4);
  assert.equal(odd.endMonth, 10);
  assert.equal(project({ fields: [odd], months: 24 }).totals.expenses, 500);
});

test('a loan taken later is not a debt you carry today', () => {
  const later = loan('120000', '4', 60);
  const deferred = createField({ ...later, startMonth: 13, id: undefined });
  assert.equal(drawMonthOf(deferred), 12, 'the money arrives the month before the first payment');
  assert.equal(firstPaymentOf(deferred), 13);
  assert.equal(contributionOf(deferred, 12), 0, 'nothing repaid before it is taken');
  assert.ok(contributionOf(deferred, 13) > 0);

  assert.equal(outstandingOf(deferred, 6), 0, 'not borrowed yet');
  assert.equal(outstandingOf(deferred, 12), 120000, 'borrowed');
  assert.ok(outstandingOf(deferred, 13) < 120000, 'and repaying');
  assert.equal(outstandingOf(deferred, 72), 0, 'cleared 60 payments later');

  const result = project({ fields: [income(4000), deferred], months: 84 });
  assert.equal(result.points[0].debt, 0, 'today you owe nothing');
  assert.equal(result.points[11].debt, 0);
  assert.equal(result.points[12].debt, 120000);
  assert.equal(result.points[84].debt, 0);
});

test('a loan with no start of its own repays exactly as it always did', () => {
  const field = loan('120000', '6', 120);
  assert.equal(drawMonthOf(field), 0);
  assert.equal(firstPaymentOf(field), 1);
  const result = project({ fields: [field], months: 120 });
  assert.equal(result.points[0].debt, 120000, 'owed from the outset');
  assert.equal(result.points[120].debt, 0);
  assert.equal(roundMoney(result.points[0].worth - result.points[120].worth), loanInterest(field));
});

test('an investment can be paid into for a while and then left alone', () => {
  const paying = createField({ kind: 'investment', amount: '500', annualRate: '6', endMonth: 60 });
  const result = project({ fields: [paying], months: 120 });
  assert.equal(result.totals.contributed, 500 * 60, 'sixty payments, then nothing');
  assert.equal(result.points[61].contributed, result.points[120].contributed);
  assert.ok(result.points[120].invested > result.points[60].invested, 'but it kept growing');
});

test('an asset never carries a window, because it never lands', () => {
  const house = createField({ kind: 'asset', amount: '250000', startMonth: 12, endMonth: 40 });
  assert.equal(house.startMonth, 0);
  assert.equal(house.endMonth, 0);
});

test('a window is coerced, never trusted', () => {
  const wild = createField({ direction: 'expense', amount: '10', startMonth: 'soon', endMonth: 99999 });
  assert.equal(wild.startMonth, 0);
  assert.equal(wild.endMonth, 600, 'clamped to the longest projection');
});

/* ------------------------------------------------- an amount that climbs */

const climbing = (amount, annualRate, extra = {}) => createField({
  direction: 'income', amount, annualRate, ...extra,
});

test('a raise arrives on the anniversary, not a little each month', () => {
  const wage = climbing('4000', '3');
  // Months 1 to 12 are the first year — twelve payments at what you typed.
  assert.deepEqual(
    [1, 6, 12, 13, 24, 25].map((m) => contributionOf(wage, m)),
    [4000, 4000, 4000, 4120, 4120, 4243.6],
    'twelve payments, then a step',
  );
});

test('the climb counts from the field\'s own start', () => {
  const wage = climbing('4000', '3', { startMonth: 6 });
  assert.equal(yearsRunning(wage, 17), 0);
  assert.equal(yearsRunning(wage, 18), 1);
  assert.deepEqual([6, 17, 18].map((m) => contributionOf(wage, m)), [4000, 4000, 4120]);
});

test('a rate does nothing at all to a field that has none', () => {
  const flat = createField({ direction: 'income', amount: '4000' });
  assert.deepEqual([1, 12, 120].map((m) => contributionOf(flat, m)), [4000, 4000, 4000]);
  assert.equal(project({ fields: [flat], months: 120 }).totals.income, 480000);
});

test('a climbing amount compounds, and beats a flat one', () => {
  const flat = project({ fields: [createField({ direction: 'income', amount: '4000' })], months: 120 });
  const rising = project({ fields: [climbing('4000', '3')], months: 120 });
  assert.ok(rising.totals.income > flat.totals.income);
  assert.equal(contributionOf(climbing('4000', '3'), 120), roundMoney(4000 * 1.03 ** 9));
  assert.equal(contributionOf(climbing('4000', '3'), 133), roundMoney(4000 * 1.03 ** 11));
});

test('a less-than-monthly amount climbs too, on the same anniversaries', () => {
  const bill = createField({ direction: 'expense', amount: '600', annualRate: '5', periodMonths: 12 });
  // The first landing is at what you typed; each later one has climbed again.
  assert.deepEqual([12, 24, 36].map((m) => contributionOf(bill, m)), [600, 630, 661.5]);
});

test('a rate on an investment is its return, never a bigger contribution', () => {
  // The same slot means different things by kind, and confusing the two would
  // pay in more every year because the market did well.
  const fund = createField({ kind: 'investment', amount: '500', annualRate: '7' });
  assert.deepEqual([1, 12, 24, 120].map((m) => contributionOf(fund, m)), [500, 500, 500, 500]);
  assert.equal(project({ fields: [fund], months: 120 }).totals.contributed, 60000);
});

test('a rate on a loan is its interest, never a bigger payment', () => {
  const debt = loan('120000', '6', 120);
  const first = contributionOf(debt, 1);
  assert.equal(contributionOf(debt, 60), first, 'the payment is level, that is what a loan is');
  assert.equal(contributionOf(debt, 120), first);
});

test('growth is coerced, never trusted', () => {
  assert.equal(grownBy('1000', 'nonsense', 5), 1000);
  assert.equal(grownBy('1000', '3', 0), 1000, 'no whole year yet');
  assert.equal(grownBy('1000', '3', -2), 1000, 'and never runs backwards');
  assert.equal(grownBy('', '3', 5), 0, 'nothing climbs from nothing');
  assert.equal(grownBy('1000', '0', 5), 1000);
  assert.ok(grownBy('1000', '-10', 2) < 1000, 'a rate can point down');
});

test('a climb and a window work together', () => {
  const wage = climbing('1000', '10', { startMonth: 3, endMonth: 30 });
  assert.equal(contributionOf(wage, 2), 0, 'not started');
  assert.equal(contributionOf(wage, 3), 1000);
  assert.equal(contributionOf(wage, 15), 1100, 'one year in');
  assert.equal(contributionOf(wage, 27), 1210, 'two years in');
  assert.equal(contributionOf(wage, 31), 0, 'ended');
});
