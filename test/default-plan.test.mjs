import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultStrategies, DEFAULT_PLAN, nameOf } from '../assets/js/strategies.js';
import { normalizeFields, createField, labelOf } from '../assets/js/fields.js';
import { project, loanPayment, roundMoney, monthlyOf } from '../assets/js/projection.js';
import { makeTranslator, LANGUAGES } from '../assets/js/i18n.js';

const plans = () => defaultStrategies();
const fieldsOf = (index) => normalizeFields(plans()[index].fields);
const at = (index, months) => project({ fields: fieldsOf(index), months }).points[months];

test('all three plans spend the same on housing each month', () => {
  // The comparison is only worth making if nothing is quietly saving more: the
  // renters' rent plus what they invest is exactly the loan's repayment.
  const repayment = loanPayment(DEFAULT_PLAN.house, DEFAULT_PLAN.loanRate, DEFAULT_PLAN.term);
  assert.equal(roundMoney(Number(DEFAULT_PLAN.rent) + Number(DEFAULT_PLAN.spare)), repayment);
});

test('the months the renters buy are the months they can afford to', () => {
  // These are written down because nothing in the model is conditional. That
  // makes them a hard-coded answer to a question the figures decide, so they
  // are recomputed here: change a figure without moving them and this fails.
  const renting = [
    createField({ direction: 'income', amount: DEFAULT_PLAN.salary }),
    createField({ direction: 'expense', amount: DEFAULT_PLAN.living }),
    createField({ direction: 'expense', amount: DEFAULT_PLAN.rent }),
    createField({ kind: 'investment', amount: DEFAULT_PLAN.spare, annualRate: DEFAULT_PLAN.fundRate }),
  ];
  const run = project({ fields: renting, months: 400 });
  const firstMonth = (test_) => {
    for (let month = 1; month <= 400; month += 1) if (test_(run.points[month])) return month;
    return null;
  };
  const price = Number(DEFAULT_PLAN.house);
  assert.equal(firstMonth((p) => p.net >= price), DEFAULT_PLAN.buyOnCash, 'cash alone');
  assert.equal(
    firstMonth((p) => roundMoney(p.net + p.invested) >= price), DEFAULT_PLAN.buyOnBoth,
    'cash and the fund together',
  );
  assert.ok(DEFAULT_PLAN.buyOnBoth < DEFAULT_PLAN.buyOnCash, 'selling the fund buys sooner');
});

test('nobody owns the house before they have bought it', () => {
  // The whole point of the comparison: two of these plans rent for years.
  assert.ok(at(0, 1).owned > 0, 'the borrower owns it from the first month');
  for (const [index, buy] of [[1, DEFAULT_PLAN.buyOnCash], [2, DEFAULT_PLAN.buyOnBoth]]) {
    assert.equal(at(index, buy - 1).owned, 0, `plan ${index} owns nothing the month before`);
    assert.equal(at(index, buy).owned, Number(DEFAULT_PLAN.house), `plan ${index} owns it that month`);
  }
});

test('the fund is spent by the plan that sells it, and kept by the one that does not', () => {
  const sale = DEFAULT_PLAN.buyOnBoth;
  assert.ok(at(2, sale - 1).invested > 0, 'held right up to the sale');
  // Not spent and held at once: the month it is sold, nothing is held — and
  // the fund that starts the month after is a different, later one.
  assert.equal(at(2, sale).invested, 0, 'sold, it is gone');
  assert.ok(at(2, sale).proceeds > 0, 'and it is what paid for the house');
  assert.equal(at(1, DEFAULT_PLAN.term).proceeds, 0, 'the other plan never sold anything');
});

test('housing money goes back into the fund once the house is paid for', () => {
  // Otherwise the plan that buys first would win on what it did with spare
  // cash rather than on when it came to own the house.
  const horizon = DEFAULT_PLAN.term;
  for (const index of [1, 2]) {
    const buy = index === 1 ? DEFAULT_PLAN.buyOnCash : DEFAULT_PLAN.buyOnBoth;
    assert.equal(at(index, buy).invested === 0, index === 2, 'nothing new the month of the purchase');
    assert.ok(at(index, buy + 1).invested > at(index, buy).invested, `plan ${index} starts again the month after`);
    assert.ok(at(index, horizon).invested > 0, `plan ${index} is still building at the horizon`);
  }
  // The borrower's housing is paid for only when the last repayment lands, so
  // nothing of theirs is invested inside the default horizon — and the rule
  // still holds beyond it.
  assert.equal(at(0, horizon).invested, 0);
  assert.ok(at(0, horizon + 24).invested > 0, 'and it starts once the loan is done');
});

test('every plan clears its housing by the end, and none goes into the red', () => {
  const horizon = DEFAULT_PLAN.term;
  for (const index of [0, 1, 2]) {
    const end = at(index, horizon);
    assert.equal(end.debt, 0, `plan ${index} owes nothing after twenty years`);
    assert.ok(end.owned > 0, `plan ${index} owns the house`);
    assert.ok(end.worth > 0, `plan ${index} is worth something`);
    // A plan whose cash goes negative reads as an overdraft nobody arranged.
    for (let month = 0; month <= horizon; month += 1) {
      const point = project({ fields: fieldsOf(index), months: horizon }).points[month];
      assert.ok(point.net >= 0, `plan ${index} keeps its cash positive at month ${month}`);
    }
  }
});

test('every plan has months where more goes out than comes in, cumulative net or no', () => {
  // The test above holds all three plans to a cash balance that never goes
  // negative, and that is exactly the reading that hides this: a running total
  // that only ever climbs says nothing about the month the property-tax bill
  // lands on top of everything else, or the month a renter hands over the whole
  // price of a house. The app deliberately makes such months possible, so the
  // plans it opens with have them, and the per-month reading is what shows them.
  const horizon = DEFAULT_PLAN.term;
  for (const index of [0, 1, 2]) {
    const run = project({ fields: fieldsOf(index), months: horizon });
    const behind = monthlyOf(run, 'net').filter((point) => point.value < 0);
    assert.ok(behind.length > 0, `plan ${index} has a month it does not cover`);
    // The bill is levied yearly from the month it starts, so the months it
    // lands on are a year apart — read out of the curve rather than restated.
    const gaps = new Set(behind.slice(1).map((point, before) => point.month - behind[before].month));
    assert.ok(gaps.has(12), `plan ${index} is short a year after it was short before`);
  }

  // The renters hand over the price of a house in a single month, which is
  // years of saving leaving at once and nothing any month's pay comes near.
  for (const [index, buy] of [[1, DEFAULT_PLAN.buyOnCash], [2, DEFAULT_PLAN.buyOnBoth]]) {
    const run = project({ fields: fieldsOf(index), months: horizon });
    const each = monthlyOf(run, 'net');
    const worst = each.reduce((low, point) => (point.value < low.value ? point : low));
    assert.equal(worst.month, buy, `plan ${index}'s worst month is the month it buys`);
    assert.ok(worst.value < -Number(DEFAULT_PLAN.house) / 2, `plan ${index} is not nearly covered that month`);
    // And the balance sheet says the month left them no poorer: the money
    // became a house. That two cards read a month at a time disagree like this
    // is the whole reason both of them carry the toggle.
    assert.ok(monthlyOf(run, 'worth')[buy].value > 0, `plan ${index} is no worse off for buying`);
  }
});

test('the answer depends on how far out you look, and the README says which way', () => {
  // Both halves are claims the README makes out loud, so neither may quietly
  // stop being true: borrowing wins over the horizon the app opens on, and
  // loses over a long one, because 6% compounding outruns a 1.5% house.
  const worthAt = (months) => [0, 1, 2].map((index) => at(index, months).worth);
  const [loanShort, cashShort, fundShort] = worthAt(DEFAULT_PLAN.term);
  assert.ok(loanShort > fundShort && fundShort > cashShort, 'at twenty years the borrower leads');

  const [loanLong, cashLong, fundLong] = worthAt(480);
  assert.ok(cashLong > loanLong && fundLong > loanLong, 'at forty years both renters are ahead');
  assert.ok(cashLong > fundLong, 'and the fund left alone beats the fund sold');
});

test('the plans and their fields are named in both languages', () => {
  for (const language of LANGUAGES) {
    const t = makeTranslator(language);
    plans().forEach((strategy, index) => {
      const name = nameOf(strategy, index, t);
      assert.ok(name && !name.startsWith('strategy.'), `plan ${index} is named in ${language}: ${name}`);
      for (const field of normalizeFields(strategy.fields)) {
        const label = labelOf(field, t);
        assert.ok(label && !label.startsWith('field.'), `a field of plan ${index} in ${language}: ${label}`);
      }
    });
  }
});

test('pay and everyday costs are one field the three plans share', () => {
  const [one, two, three] = plans().map((strategy) => normalizeFields(strategy.fields));
  const synced = (fields) => fields.filter((field) => field.synced).map((field) => field.id).sort();
  assert.equal(synced(one).length, 2, 'the salary and the shopping');
  assert.deepEqual(synced(one), synced(two), 'the same two fields, by id');
  assert.deepEqual(synced(one), synced(three));
});
