import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultStrategies, DEFAULT_PLAN, nameOf } from '../assets/js/strategies.js';
import { normalizeFields, createField, labelOf } from '../assets/js/fields.js';
import { project, loanPayment, roundMoney } from '../assets/js/projection.js';
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
  const horizon = DEFAULT_PLAN.term;
  assert.ok(at(1, horizon).invested > 0, 'left alone, it is still there');
  assert.equal(at(2, horizon).invested, 0, 'sold, it is gone — not spent and held at once');
  // Selling converts; it never creates. Worth is untouched on the day.
  const before = at(2, DEFAULT_PLAN.buyOnBoth - 1);
  assert.ok(before.invested > 0, 'held right up to the sale');
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
