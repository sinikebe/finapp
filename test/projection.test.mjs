import test from 'node:test';
import assert from 'node:assert/strict';

import {
  project, inTodaysMoney, shiftReturns, monthlyGrowth, afterTax,
  seriesOf, monthlyOf, extentOf, hasAmounts, hasInvestments, hasDebt, hasOwned,
  flowIn, contributionOf, outstandingOf, startOf, firstPaymentOf, drawMonthOf, lastLandingOf,
  grownBy, yearsRunning, fieldTotalOf, loanPartsOf, shareOut,
  loanPayment, loanInterest, loanTotal, borrowedOf, monthlyRate,
  toAmount, toMonths, toNumber, roundMoney, MAX_MONTHS, MAX_AMOUNT,
  swingsOf, SWING,
} from '../assets/js/projection.js';
import { createField, normalizeFields, raiseAmount } from '../assets/js/fields.js';

const income = (amount) => createField({ direction: 'income', amount });
const expense = (amount) => createField({ direction: 'expense', amount });

test('a figure is read the way it was written, in either notation', () => {
  // A number box parses by the browser's locale while the app prints by the
  // reader's chosen language, so the two disagree the moment they differ: a
  // French reader was shown 674 379,24 and had the comma dropped out of what
  // they typed back, storing twelve-fifty as 1250.
  assert.equal(toNumber('12,50'), 12.5, 'a comma is a decimal point');
  assert.equal(toNumber('12.50'), 12.5);
  assert.equal(toNumber('2,5'), 2.5);
  assert.equal(toNumber('674\u00a0379,24'), 674379.24, 'a no-break space groups');
  assert.equal(toNumber('674\u202f379,24'), 674379.24, 'so does a narrow one');
  assert.equal(toNumber('1 234,56'), 1234.56);

  // ...except where it is plainly grouping, which is what it was before.
  assert.equal(toNumber('1,234'), 1234, 'three digits after it is a thousand');
  assert.equal(toNumber('1,234,567'), 1234567, 'and so is more than one of them');
  assert.equal(toNumber('1,234.56'), 1234.56, 'a decimal point settles it outright');

  assert.equal(toNumber(42), 42, 'a number is already read');
  for (const junk of ['', 'abc', null, undefined, {}, [], NaN]) {
    assert.ok(Number.isNaN(toNumber(junk)), `${String(junk)} is not a figure`);
  }

  // And every coercion the reader's typing reaches agrees with it.
  assert.equal(toAmount('12,50'), 12.5);
  assert.equal(toAmount('abc'), 0);
  assert.equal(monthlyRate('2,4'), 2.4 / 100 / 12);
  assert.equal(monthlyGrowth('-1,2'), -1.2 / 100 / 12);
  assert.equal(afterTax(100, '12,5'), 87.5);
  assert.equal(grownBy('100', '2,5', 1), 102.5);
  assert.equal(shiftReturns([createField({ kind: 'investment', annualRate: '6,5' })], '1,5')[0].annualRate, '8');
});

test('interest is what a loan costs, and a cost is never negative', () => {
  // A payment is rounded to the cent in both directions, so at 0% the residue
  // can fall a penny short: 1,000 over three months repays 333.33 a month, and
  // the row advertised "-0.01 of interest" over a diagram reporting 0 for the
  // same quantity — `loanPartsOf` has always floored its own.
  const short = createField({ kind: 'loan', amount: '1000', annualRate: '0', termMonths: 3 });
  assert.equal(loanInterest(short), 0, 'a loan that repays a penny less has cost nothing');
  assert.equal(loanInterest(short), loanPartsOf(short, 4).interest, 'and the two agree');

  // The other direction is real interest and stays reported: at 0% a payment
  // rounded to the cent need not divide the principal evenly, and `loanInterest`
  // has always called that residue what it is.
  const over = createField({ kind: 'loan', amount: '200000', annualRate: '0', termMonths: 300 });
  assert.equal(loanTotal(over), 200001);
  assert.equal(loanInterest(over), 1, 'a rounded-up repayment costs the extra unit');
  assert.equal(loanInterest(over), loanPartsOf(over, 301).interest);

  // The row and the diagram agree for every 0% loan, whichever way it rounds.
  for (const [amount, term] of [[1000, 3], [438132, 98], [1, 7], [999, 11], [50000, 360]]) {
    const loan = createField({ kind: 'loan', amount: String(amount), annualRate: '0', termMonths: term });
    assert.ok(loanInterest(loan) >= 0, `${amount} over ${term} months costs nothing or more`);
    assert.equal(loanInterest(loan), loanPartsOf(loan, term + 1).interest, `${amount}/${term} agree`);
  }
});

test('a rate left blank is the nought the rest of the model reads it as', () => {
  // `monthlyGrowth('')` is 0, and blank is what every investment starts out
  // with — so skipping it here banded the field the reader had just added
  // differently from an identical one where they had typed the nought in.
  const blank = createField({ kind: 'investment', amount: '500' });
  const zero = createField({ kind: 'investment', amount: '500', annualRate: '0' });
  const over = (field) => project({ fields: [field], months: 120 }).totals.invested;
  assert.equal(over(blank), over(zero), 'the two project identically to begin with');

  for (const shift of [3, -3]) {
    assert.equal(
      over(shiftReturns([blank], shift)[0]),
      over(shiftReturns([zero], shift)[0]),
      `and identically once returns move by ${shift}`,
    );
  }
  assert.equal(shiftReturns([blank], 3)[0].annualRate, '3');
  assert.equal(shiftReturns([createField({ kind: 'investment', annualRate: '6' })], 3)[0].annualRate, '9',
    'a rate of its own still moves by the same points');
  assert.equal(shiftReturns([blank], 0)[0], blank, 'and a shift of nothing is still a no-op');
});

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
    proceeds: 0,
    profit: 0,
    owned: 0,
    debt: 0,
    worth: 0,
  }, 'every series starts at nothing');
});

test('a fund sold at a gain still counts as a gain', () => {
  // `contributed` keeps counting what was paid in, so without the proceeds
  // beside it, selling would read as having lost every penny ever paid.
  const sold = createField({ kind: 'investment', amount: '100', annualRate: '6', sellMonth: 24 });
  const end = project({ fields: [sold], months: 36, taxRate: '0' }).points[36];
  assert.equal(end.invested, 0, 'nothing held any more');
  assert.equal(end.contributed, 2400, 'but this is still what went in');
  assert.ok(end.proceeds > 2400, 'and it sold for more than that');
  assert.equal(end.profit, roundMoney(end.proceeds - end.contributed), 'so the gain is the gain');
  assert.ok(end.profit > 0, 'never a loss for having sold at a profit');

  // Held or sold, the same fund has made the same money by the same month.
  const held = createField({ kind: 'investment', amount: '100', annualRate: '6', endMonth: 24 });
  const heldEnd = project({ fields: [held], months: 24, taxRate: '0' }).points[24];
  const soldEnd = project({ fields: [sold], months: 24, taxRate: '0' }).points[24];
  assert.equal(soldEnd.profit, heldEnd.profit);
  assert.equal(soldEnd.worth, heldEnd.worth);
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
    proceeds: last.proceeds,
    profit: last.profit,
    owned: last.owned,
    debt: last.debt,
    worth: last.worth,
  });
  assert.equal(result.totals.income, 4200 * 60);
});

test('income is exactly what fields earned plus what was cashed in', () => {
  // The flow diagram apportions the income total across the income fields and
  // names the remainder, so the two have to add up to it exactly. When they did
  // not, every salary was handed a share of money it never paid — and a plan
  // with no income field at all left the pool empty on one side and full on the
  // other, which is a diagram saying something untrue about arithmetic.
  const sold = createField({ kind: 'investment', amount: '500', annualRate: '6', sellMonth: 12 });
  const earnedBy = (result) => roundMoney(result.fields
    .filter((field) => field.direction === 'income')
    .reduce((sum, field) => sum + fieldTotalOf(field, result.months), 0));

  const wage = project({ fields: [income(2200), sold, expense(100)], months: 24 });
  assert.ok(wage.totals.proceeds > 0, 'the holding was sold inside the horizon');
  assert.equal(roundMoney(earnedBy(wage) + wage.totals.proceeds), wage.totals.income);

  // The case with nothing to apportion: the sale is the only money arriving.
  const none = project({ fields: [sold, expense(100)], months: 24 });
  assert.equal(earnedBy(none), 0, 'no field earns anything here');
  assert.equal(none.totals.proceeds, none.totals.income, 'so all of it was cashed in');

  // And the case with nothing to name: no holding is sold, so income is earned.
  const plain = project({ fields: [income(2200), expense(100)], months: 24 });
  assert.equal(plain.totals.proceeds, 0);
  assert.equal(earnedBy(plain), plain.totals.income);
});

test('the last month a field lands on is a month it actually lands on', () => {
  // The note under a climbing field quotes what it will be worth "by month N".
  // It used to take N from the horizon, which is not a month the field
  // necessarily moves money in: a yearly amount over twenty months last landed
  // at month 12, so the note named a figure the projection never uses.
  const yearly = createField({ direction: 'expense', amount: '1000', annualRate: '5', periodMonths: 12 });
  assert.equal(lastLandingOf(yearly, 20), 12, 'the horizon is not a landing');
  assert.equal(lastLandingOf(yearly, 12), 12);
  assert.equal(lastLandingOf(yearly, 11), 0, 'and before the first one there is none');

  const ending = createField({ direction: 'expense', amount: '500', annualRate: '2', endMonth: 60 });
  assert.equal(lastLandingOf(ending, 240), 60, 'nor after a field has stopped');

  const sold = createField({ kind: 'investment', amount: '500', annualRate: '6', sellMonth: 24 });
  assert.equal(lastLandingOf(sold, 240), 24, 'nor after a holding is cashed in');

  assert.equal(lastLandingOf(createField({ direction: 'expense', amount: '500' }), 240), 240, 'monthly runs to the end');
  assert.equal(lastLandingOf(createField({ kind: 'once', amount: '900', startMonth: 7 }), 240), 7);
  assert.equal(lastLandingOf(createField({ direction: 'expense', amount: '500', startMonth: 300 }), 240), 0,
    'a field that never starts inside the horizon lands nowhere in it');
  assert.equal(lastLandingOf(createField({ direction: 'expense', amount: '' }), 240), 0, 'and nor does an empty one');

  // It agrees with the projection because it asks it: every month after the
  // one it names moves nothing.
  for (const field of [yearly, ending, sold]) {
    const last = lastLandingOf(field, 240);
    assert.ok(contributionOf(field, last) > 0, 'the month it names does move money');
    for (let month = last + 1; month <= 240; month += 1) {
      assert.equal(contributionOf(field, month), 0, `nothing lands at month ${month}`);
    }
  }

  // Which is the whole point: the figure the note quotes for that month is the
  // figure the field moves in it. Quoting the horizon instead named 728.41 for
  // a field whose last payment was 541.22.
  const climbing = [yearly, ending, createField({ direction: 'expense', amount: '500', annualRate: '2' })];
  for (const field of climbing) {
    for (const months of [20, 60, 240]) {
      const last = lastLandingOf(field, months);
      if (!last) continue;
      assert.equal(
        grownBy(field.amount, field.annualRate, yearsRunning(field, last)),
        contributionOf(field, last),
        `what the note would quote at month ${last} is what the field moves there`,
      );
    }
  }
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
    proceeds: 0,
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

test('monthlyOf says what moved in each month, and nothing in month 0', () => {
  const result = project({ fields: [income(100), expense(40)], months: 3 });
  assert.deepEqual(monthlyOf(result, 'expenses'), [
    { month: 0, value: 0 }, { month: 1, value: 40 }, { month: 2, value: 40 }, { month: 3, value: 40 },
  ]);
  // Month 0 has no month before it, so nothing can have moved during it. What
  // it must not do is carry the opening balance through: the house is owned
  // from the first month, and read a month at a time that is not a month's
  // gain — it was already there.
  const owner = project({
    fields: [createField({ kind: 'asset', amount: 100000 })],
    months: 2,
  });
  assert.equal(seriesOf(owner, 'owned')[0].value, 100000, 'owned outright from the start');
  assert.equal(monthlyOf(owner, 'owned')[0].value, 0, 'and nothing of it moved in month 0');
});

test('the months add back up to the total they were taken from', () => {
  // The whole claim of the per-month reading is that it is the same figures
  // seen differently, so a first difference that did not telescope back to the
  // running total would be a second, disagreeing model.
  //
  // It adds up to what the horizon *moved*, which is the closing figure less
  // the opening one — and for a balance sheet those differ: the house here is
  // owned from month 0, so the months have to come to the total less the house,
  // not to the total. That is the same rule the card follows.
  const fields = [
    income(2200),
    expense(1000),
    createField({ direction: 'expense', amount: 800, periodMonths: 12 }),
    createField({ kind: 'investment', amount: 300, annualRate: '6' }),
    createField({ kind: 'asset', amount: 90000, annualRate: '1.5' }),
  ];
  const result = project({ fields, months: 40 });
  for (const key of ['income', 'expenses', 'net', 'invested', 'owned', 'worth']) {
    const moved = monthlyOf(result, key).reduce((sum, point) => sum + point.value, 0);
    const opening = result.points[0][key];
    assert.equal(roundMoney(moved), roundMoney(result.totals[key] - opening), `${key} adds back up`);
  }
  assert.equal(result.points[0].owned, 90000, 'the house was there before the first month');
});

test('a month where more goes out than comes in is visible in the per-month net', () => {
  // The question the running total cannot answer, and the reason this reading
  // exists: a plan can be comfortably ahead over its whole horizon and still
  // have one month where the yearly bill lands on top of everything else.
  const bill = createField({ direction: 'expense', amount: 1200, periodMonths: 12 });
  const result = project({ fields: [income(1000), expense(400), bill], months: 24 });
  assert.ok(seriesOf(result, 'net').every((point) => point.value >= 0), 'never behind, cumulatively');

  const each = monthlyOf(result, 'net');
  assert.equal(each[11].value, 600, 'an ordinary month keeps 600');
  assert.equal(each[12].value, -600, 'the month the yearly bill lands does not');
  assert.deepEqual(each.filter((point) => point.value < 0).map((point) => point.month), [12, 24]);
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

test('a loan borrows what you need plus the fees on top', () => {
  const withFees = createField({
    kind: 'loan', direction: 'expense', amount: '200000', fees: '3000', annualRate: '4.5', termMonths: 300,
  });
  assert.equal(borrowedOf(withFees), 203000);
  // The amount is what reaches you; the payment is worked out on what the bank
  // actually lends, which is the whole point of entering it this way round.
  assert.equal(contributionOf(withFees, 1), loanPayment('203000', '4.5', 300));
  assert.notEqual(contributionOf(withFees, 1), loanPayment('200000', '4.5', 300));
});

test('no fees means the loan borrows exactly its amount, as it always did', () => {
  const plain = loan('200000', '4.5', 300);
  assert.equal(borrowedOf(plain), 200000);
  assert.equal(contributionOf(plain, 1), 1111.66);
  // Every loan stored before fees existed carries none, so nothing moved.
  assert.equal(createField({ kind: 'loan' }).fees, '');
  assert.equal(borrowedOf(loan('12000', '0', 24)), 12000);
});

test('entering the amount you need is the same as entering the old total', () => {
  // The two ways of saying the same loan must agree in every figure, which is
  // what makes this a change of what you type rather than of what it means.
  const needed = createField({
    kind: 'loan', direction: 'expense', amount: '18000', fees: '600', annualRate: '5.9', termMonths: 48,
  });
  const total = loan('18600', '5.9', 48);
  assert.equal(borrowedOf(needed), borrowedOf(total));
  assert.equal(loanInterest(needed), loanInterest(total));
  assert.equal(outstandingOf(needed, 12), outstandingOf(total, 12));
  const a = project({ fields: [needed], months: 60 });
  const b = project({ fields: [total], months: 60 });
  assert.deepEqual(a.points, b.points);
});

test('fees are owed, not interest', () => {
  const field = createField({
    kind: 'loan', direction: 'expense', amount: '10000', fees: '500', annualRate: '0', termMonths: 10,
  });
  // At 0% nothing is interest, however large the fees.
  assert.equal(loanInterest(field), 0);
  // The debt is what was lent, fees included, from the month it is drawn.
  assert.equal(outstandingOf(field, 0), 10500);
  const result = project({ fields: [field], months: 12 });
  assert.equal(result.points[0].debt, 10500);
  assert.equal(result.points[10].debt, 0);
  // 10,500 repaid to receive 10,000: the fees are exactly what it cost.
  assert.equal(result.totals.expenses, 10500);
  assert.equal(result.points[10].worth, -10500);
});

test('fees alone still make a debt, and still count as an amount', () => {
  const field = createField({
    kind: 'loan', direction: 'expense', amount: '', fees: '400', annualRate: '0', termMonths: 4,
  });
  const result = project({ fields: [field], months: 6 });
  assert.equal(hasDebt(result), true);
  assert.equal(hasAmounts(result), true, 'or the tile would contradict the chart');
  assert.equal(result.points[0].debt, 400);
});

test('interest is added to what you asked for, never taken out of it', () => {
  // The whole point of entering what you need: 100,000 borrowed is 100,000
  // owed, and the interest is what it costs on top of that — not a share of it.
  const field = loan('100000', '5', 120);
  assert.equal(borrowedOf(field), 100000);
  assert.equal(loanTotal(field), 127279.2);
  assert.equal(loanInterest(field), 27279.2);
  assert.equal(roundMoney(borrowedOf(field) + loanInterest(field)), loanTotal(field));
  assert.ok(loanTotal(field) > borrowedOf(field), 'a loan repays more than it lends');

  const result = project({ fields: [field], months: 120 });
  assert.equal(result.points[0].debt, 100000, 'you owe what you asked for, not more');
  assert.equal(result.totals.expenses, 127279.2, 'and pay out the interest on top');
});

test('what a loan repays in all is every payment, fees included', () => {
  const withFees = createField({
    kind: 'loan', direction: 'expense', amount: '200000', fees: '3000', annualRate: '4.5', termMonths: 300,
  });
  assert.equal(loanTotal(withFees), roundMoney(loanPayment('203000', '4.5', 300) * 300));
  assert.equal(roundMoney(borrowedOf(withFees) + loanInterest(withFees)), loanTotal(withFees));
});

test('a loan is clear the month its last payment lands', () => {
  // Only reachable once the horizon can outlast a long loan. The balance is
  // cleared by construction when the term is up, so the last month's rounding
  // must not linger as a few cents still owed.
  const field = loan('200000', '4.5', 300);
  const result = project({ fields: [field], months: 302 });
  assert.equal(result.points[299].debt, 1110.19, 'still owing with one payment to go');
  assert.equal(result.points[300].debt, 0, 'and clear the month it is paid off');
  assert.equal(result.totals.expenses, loanTotal(field), 'every payment still lands');
});

test('the projection and the outstanding balance agree on every month', () => {
  // Two ways of walking the same amortisation; they disagreed at exactly the
  // last month of the term, which only a horizon long enough to reach it shows.
  for (const field of [loan('200000', '4.5', 300), loan('12000', '6', 24), loan('50000', '0', 60)]) {
    const term = Number(field.termMonths);
    const result = project({ fields: [field], months: term + 2 });
    for (let month = 0; month <= term + 2; month += 1) {
      assert.equal(
        result.points[month].debt, outstandingOf(field, month),
        `month ${month} of a ${term}-month loan`,
      );
    }
  }
});

test('what a loan repaid splits into principal, fees and interest', () => {
  const field = createField({
    kind: 'loan', direction: 'expense', amount: '200000', fees: '3000', annualRate: '4.5', termMonths: 300,
  });
  // Whatever the horizon, the parts are exactly what the diagram already draws.
  for (const months of [1, 12, 120, 299, 300, 360]) {
    const parts = loanPartsOf(field, months);
    assert.equal(parts.total, fieldTotalOf(field, months), `total at ${months}`);
    assert.equal(
      roundMoney(parts.principal + parts.fees + parts.interest), parts.total,
      `parts sum at ${months}`,
    );
    assert.ok(parts.principal >= 0 && parts.fees >= 0 && parts.interest >= 0, `signs at ${months}`);
  }
  // Run to the end and the split is the loan itself, to the cent.
  const done = loanPartsOf(field, 300);
  assert.equal(done.principal, 200000);
  assert.equal(done.fees, 3000);
  assert.equal(done.interest, loanInterest(field));
});

test('the split agrees with the debt tile on what is left to pay', () => {
  const field = createField({
    kind: 'loan', direction: 'expense', amount: '200000', fees: '3000', annualRate: '4.5', termMonths: 300,
  });
  for (const months of [12, 120, 300]) {
    const parts = loanPartsOf(field, months);
    const result = project({ fields: [field], months });
    assert.equal(
      roundMoney(parts.principal + parts.fees),
      roundMoney(borrowedOf(field) - result.points[months].debt),
      `what has come off the balance by month ${months}`,
    );
  }
});

test('a loan with nothing to split is one flow, not three', () => {
  const free = loan('12000', '0', 24);
  const parts = loanPartsOf(free, 24);
  assert.equal(parts.interest, 0);
  assert.equal(parts.fees, 0);
  assert.equal(parts.principal, 12000);
  // And anything that is not a loan is simply itself.
  const plain = createField({ direction: 'expense', amount: '500' });
  const whole = loanPartsOf(plain, 12);
  assert.equal(whole.principal, fieldTotalOf(plain, 12));
  assert.equal(whole.interest, 0);
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

test('an asset is acquired at a month, and never stops being owned', () => {
  const house = createField({ kind: 'asset', amount: '250000', startMonth: 12, endMonth: 40 });
  assert.equal(house.startMonth, 12, 'the month you come to own it is yours to set');
  assert.equal(house.endMonth, 0, 'but you do not stop owning a thing');
});

test('a thing bought later is worth nothing before it is bought', () => {
  // Without this a plan to buy in five years counts the flat from today, which
  // flatters exactly the plan that has not bought it yet.
  const house = createField({ kind: 'asset', amount: '100000', annualRate: '1.5', startMonth: 60 });
  const result = project({ fields: [house], months: 72 });
  assert.equal(result.points[0].owned, 0);
  assert.equal(result.points[59].owned, 0, 'still nothing the month before');
  assert.equal(result.points[60].owned, 100000, 'worth what it cost the month it is yours');
  assert.ok(result.points[72].owned > 100000, 'and appreciating from there, not before');
  // Owned from the outset is what every asset written before this reads as.
  const already = createField({ kind: 'asset', amount: '100000' });
  assert.equal(already.startMonth, 0);
  assert.equal(project({ fields: [already], months: 1 }).points[0].owned, 100000);
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

/* ------------------------------------------------ what each field moved */

test('a field total is what it moved across the whole horizon', () => {
  assert.equal(fieldTotalOf(income(3000), 12), 36000);
  assert.equal(fieldTotalOf(yearly('600'), 36), 1800, 'three landings');
  assert.equal(fieldTotalOf(asset('250000', '5'), 120), 0, 'an asset moves nothing');
  assert.equal(fieldTotalOf(once('9000', 18), 12), 0, 'outside the horizon');
  assert.equal(fieldTotalOf(once('9000', 18), 24), 9000);
});

test('field totals reconcile with the totals the summary shows', () => {
  const fields = [
    income(4000), income(250), between('1200', 4, 40),
    once('25000', 18), loan('120000', '4', 60),
    createField({ kind: 'investment', amount: '500', annualRate: '7' }),
    asset('250000', '2'),
  ];
  const result = project({ fields, months: 120 });
  const summed = (direction) => roundMoney(result.fields
    .filter((field) => field.direction === direction)
    .reduce((total, field) => total + fieldTotalOf(field, 120), 0));
  assert.equal(summed('income'), result.totals.income);
  assert.equal(summed('expense'), result.totals.expenses);
});

/* --------------------------------------------- apportioning a total exactly */

test('the parts always add up to the whole, however awkward the split', () => {
  const cases = [
    [100, [1, 2, 3]],
    [151154.34, [1, 1, 1, 1]],
    [999999.99, [7, 7, 7, 7, 7, 7, 7]],
    [0.03, [1, 1, 1]],
    [810851.34, [3, 1, 4, 1, 5, 9, 2, 6, 5, 3]],
    [1000, [1, 0, 0]],
  ];
  for (const [total, weights] of cases) {
    const parts = shareOut(total, weights);
    assert.equal(roundMoney(parts.reduce((a, b) => a + b, 0)), total, `${total} split ${weights}`);
    assert.equal(parts.length, weights.length);
    assert.ok(parts.every((part) => part >= 0), 'no negative share');
  }
});

test('apportioning is proportional, not merely exact', () => {
  const parts = shareOut(1000, [3, 1]);
  assert.equal(parts[0], 750);
  assert.equal(parts[1], 250);
});

test('a leftover cent goes to the largest remainder, not the first in line', () => {
  // Three equal claims on 10.00 leave a cent over; it lands on the first only
  // because the remainders tie, and the total is what must hold either way.
  const parts = shareOut(10, [1, 1, 1]);
  assert.equal(roundMoney(parts.reduce((a, b) => a + b, 0)), 10);
  assert.deepEqual(parts, [3.34, 3.33, 3.33]);
});

test('apportioning nothing, or to nothing, is not a crash', () => {
  assert.deepEqual(shareOut(0, [1, 2]), [0, 0]);
  assert.deepEqual(shareOut(100, []), []);
  assert.deepEqual(shareOut(100, [0, 0]), [0, 0], 'no weight, no share');
  assert.deepEqual(shareOut(-5, [1, 1]), [0, 0], 'a negative total is not a flow');
});

test('shares of a hundred come to a hundred', () => {
  const shares = shareOut(100, [162000, 57600, 72000, 19897.44, 192502.56]);
  assert.equal(roundMoney(shares.reduce((a, b) => a + b, 0)), 100);
});

/* ------------------------------------------------------ what moves the needle */

/** A plan with one of everything, so a ranking has something to rank. */
const mixed = () => [
  createField({ direction: 'income', amount: '2200' }),
  createField({ direction: 'expense', amount: '1000' }),
  createField({ kind: 'asset', amount: '100000', annualRate: '1.5' }),
  createField({ kind: 'loan', direction: 'expense', amount: '100000', annualRate: '3', termMonths: 240, startMonth: 1 }),
  createField({ kind: 'investment', amount: '250', annualRate: '6' }),
  createField({ direction: 'expense', amount: '800', periodMonths: 12, startMonth: 6 }),
];

/** How the ranking is asked for: a runner that projects a list of fields the
 *  way the page would, since which money the figures are in is the reader's. */
const runner = (months, taxRate) => (fields) => project({ fields, months, taxRate });

/** The same move, made to every amount at once — which is what the swings are
 *  claimed to add up to. */
const together = (fields, key, run) => {
  const all = (fraction) => run(
    fields.reduce((list, field) => raiseAmount(list, field.id, fraction, toAmount), fields),
  ).totals[key];
  return roundMoney(all(SWING) - all(-SWING));
};

test('the ranking says which figures decide where a plan lands, largest first', () => {
  const run = runner(12, '30');
  const rows = swingsOf(run(mixed()), 'worth', run);
  const sizes = rows.map((row) => Math.abs(row.swing));
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a), 'ordered by size alone');
  // Over a year the mortgage and the house it bought are the two figures that
  // decide this plan, and the fund the reader is putting 250 a month into is
  // nowhere near them. That is the whole point of the reading.
  assert.deepEqual(rows.slice(0, 2).map((row) => row.field.kind).sort(), ['asset', 'loan']);
  // Signed, because which way it goes is half of what the reader came for:
  // more salary is more worth, more spending is less of it.
  assert.ok(rows.find((row) => row.field.direction === 'income').swing > 0);
  assert.ok(rows.find((row) => row.field.amount === '1000').swing < 0);
});

test('a field with no amount in it is not ranked at all', () => {
  const run = runner(12, '0');
  const fields = [...mixed(), createField({ direction: 'expense' })];
  assert.equal(swingsOf(run(fields), 'worth', run).length, mixed().length);
});

test('the swings add up, because the model is separable', () => {
  // The obvious caveat to put on this list would be that the parts do not sum
  // to the whole. They do: every field's contribution is worked out on its own
  // and only then summed, so moving two amounts moves the figure by both swings
  // — to the cent, rounding and amortisation and compounding included.
  //
  // Which is exactly why the honest caveat is the other one. The list can rank
  // a mortgage and the house it bought one above the other and will never be
  // able to say that they were one decision.
  const run = runner(120, '30');
  const fields = mixed();
  for (const key of ['worth', 'net', 'income', 'expenses', 'invested', 'owned', 'debt']) {
    const rows = swingsOf(run(fields), key, run);
    const parts = roundMoney(rows.reduce((sum, row) => sum + row.swing, 0));
    assert.equal(parts, together(fields, key, run), `${key} adds up`);
  }
});

test('profit is the exception, because the tax falls on the gain as a whole', () => {
  // One holding gaining and one losing, with the two so close that a tenth
  // either way tips the whole across zero — and `afterTax` takes 30% of a gain
  // while leaving a loss as it stands. So what one field is worth depends on
  // what the other is doing, which is the one place the model stops being
  // separable, and the one place the caveat above has to make an exception.
  const run = runner(12, '30');
  const fields = [
    createField({ kind: 'investment', amount: '1000', annualRate: '50' }),
    createField({ kind: 'investment', amount: '1250', annualRate: '-50' }),
  ];
  const rows = swingsOf(run(fields), 'profit', run);
  const parts = roundMoney(rows.reduce((sum, row) => sum + row.swing, 0));
  const whole = together(fields, 'profit', run);
  assert.ok(Math.abs(parts - whole) > 1, `${parts} is not ${whole}, and not by a rounding`);

  // And with the whole comfortably a gain, the tax is a flat share of it and
  // profit adds up like everything else, to within the cent `afterTax` rounds
  // to. So this is a real edge rather than a permanent disclaimer over the
  // column — which is why the caveat on the card names it as the exception.
  const gaining = [
    createField({ kind: 'investment', amount: '1000', annualRate: '50' }),
    createField({ kind: 'investment', amount: '200', annualRate: '-50' }),
  ];
  const safe = swingsOf(run(gaining), 'profit', run);
  const safeParts = roundMoney(safe.reduce((sum, row) => sum + row.swing, 0));
  assert.ok(Math.abs(safeParts - together(gaining, 'profit', run)) <= 0.01);
});

test('a ranking is read in whatever money the page is in', () => {
  // The runner is handed in rather than assumed, so restating in today's money
  // restates the swings with everything else: the same order, smaller figures.
  const months = 120;
  const nominal = (fields) => project({ fields, months, taxRate: '30' });
  const real = (fields) => inTodaysMoney(nominal(fields), '2');
  const fields = mixed();
  const here = swingsOf(nominal(fields), 'worth', nominal);
  const now = swingsOf(real(fields), 'worth', real);
  assert.deepEqual(now.map((row) => row.field.id), here.map((row) => row.field.id));
  for (let index = 0; index < here.length; index += 1) {
    assert.ok(Math.abs(now[index].swing) < Math.abs(here[index].swing) || here[index].swing === 0);
  }
});
