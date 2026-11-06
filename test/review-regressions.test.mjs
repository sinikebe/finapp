import test from 'node:test';
import assert from 'node:assert/strict';
import { createField, updateField, MAX_FIELDS } from '../assets/js/fields.js';
import { toNumber, toRateNumber, MAX_NUMBER_TEXT, numberText } from '../assets/js/numbers.js';
import { loanPayment, project, monthlyRate, monthlyGrowth, fieldTotalOf, contributionOf } from '../assets/js/projection.js';
import { formatRate, setFormatLocale } from '../assets/js/format.js';
import { TEMPLATES, templateOf, repairTemplateLinks } from '../assets/js/templates.js';
import { spreadField, removeEverywhere } from '../assets/js/strategies.js';
import { normalizeMilestones, whenMet } from '../assets/js/milestones.js';
import { createScenarioRunner } from '../assets/js/scenarios.js';
import { solveFor } from '../assets/js/solve.js';
import { encodePlan, decodePlan, MAX_PLAN_TEXT, WIRE_KEYS } from '../assets/js/share.js';
import { settleTargetPatch, removeTarget, mergeSharedPlan, missingTargets } from '../assets/js/plan-operations.js';
import { makeTranslator } from '../assets/js/i18n.js';
import { METRICS } from '../assets/js/state.js';
import { labelsForFields } from '../assets/js/field-labels.js';

const target = (over = {}) => normalizeMilestones([{ id: 'deposit', name: 'Deposit', metric: 'net', amount: '3000', ...over }], METRICS);
const simple = () => ({
  months: 12, tax: '0', inflation: '2', spread: '3',
  strategies: [{ id: 'plan', fields: [
    createField({ id: 'pay', amount: '1000', direction: 'income' }),
    createField({ id: 'purchase', kind: 'once', amount: '3000', startAt: 'deposit' }),
  ] }], activeId: 'plan', milestones: target(),
});

test('editing or deleting a shared template field affects exactly one counterpart per strategy', () => {
  for (const template of TEMPLATES) {
    const plan = template.build(makeTranslator('en'));
    const field = plan.strategies[0].fields.find((one) => one.synced);
    const changed = spreadField(plan.strategies, { ...field, amount: '2700' });
    for (const strategy of changed) {
      const matching = strategy.fields.filter((one) => one.labelKey === field.labelKey);
      assert.equal(matching.length, 1, template.id);
      assert.equal(matching[0].id, field.id);
      assert.equal(matching[0].amount, '2700');
    }
    assert.deepEqual(changed.map((one) => one.fields.length), plan.strategies.map((one) => one.fields.length));
    assert.ok(removeEverywhere(changed, field.id).every((one) => !one.fields.some((entry) => entry.id === field.id)));
  }
});

test('an older template store gains shared identity without changing its figures', () => {
  const plan = templateOf('housing').build(makeTranslator('en'));
  const old = plan.strategies.map((strategy, at) => ({ ...strategy, fields: strategy.fields.map((field) => ({ ...field, id: `${at}-${field.id}` })) }));
  const fixed = repairTemplateLinks(old);
  assert.equal(new Set(fixed.map((one) => one.fields[0].id)).size, 1);
  for (let at = 0; at < fixed.length; at += 1) {
    assert.deepEqual(project({ fields: old[at].fields, months: 300 }).totals,
      project({ fields: fixed[at].fields, months: 300 }).totals);
  }
});

test('settling a target name leaves its amount and identity alone', () => {
  assert.deepEqual(settleTargetPatch({ name: 'Renamed' }, String), { name: 'Renamed' });
  assert.deepEqual(settleTargetPatch({ amount: '12,50' }, String), { amount: '12.5' });
});

test('all target identities, names and scheduled dates survive a shared-link round trip', () => {
  const plan = simple();
  plan.strategies[0].fields.push(
    createField({ amount: '10', endAt: 'deposit' }),
    createField({ kind: 'investment', amount: '10', sellAt: 'deposit' }),
  );
  const decoded = decodePlan(encodePlan(plan));
  assert.equal(decoded.milestones[0].name, 'Deposit');
  assert.notEqual(decoded.milestones[0].id, plan.milestones[0].id);
  assert.deepEqual(missingTargets(decoded.strategies, decoded.milestones), []);
  const before = createScenarioRunner(plan).run(plan.strategies[0].fields);
  const after = createScenarioRunner(decoded).run(decoded.strategies[0].fields);
  assert.deepEqual(after.points, before.points);
  assert.equal(after.schedule.months.get(decoded.milestones[0].id), before.schedule.months.get('deposit'));
});

test('version 1 links still open unless they contain references the old format lost', () => {
  const packed = { v: 1, m: 12, s: [['Old', '', [[0, WIRE_KEYS.indexOf('amount'), '100']]]], ms: [['net', '100']] };
  const wire = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  assert.ok(decodePlan(wire(packed)));
  packed.s[0][2][0].push(WIRE_KEYS.indexOf('startAt'), 'lost-target-id');
  assert.equal(decodePlan(wire(packed)), null, 'an incomplete plan must not quietly become a different plan');
  assert.equal(decodePlan('x'.repeat(MAX_PLAN_TEXT + 1)), null);
});

test('decoding bounds lists before normalizing them and rejects oversized numeric strings', () => {
  const packed = { v: 2, s: [['Bounded', '', Array.from({ length: MAX_FIELDS + 10 }, (_, id) => [id, WIRE_KEYS.indexOf('amount'), '1'])]] };
  const decoded = decodePlan(Buffer.from(JSON.stringify(packed)).toString('base64url'));
  assert.equal(decoded.strategies[0].fields.length, MAX_FIELDS);
  assert.equal(numberText('9'.repeat(MAX_NUMBER_TEXT + 1)), '');
  assert.equal(createField({ amount: '9'.repeat(MAX_NUMBER_TEXT + 1) }).amount, '');
});

test('a solver answer is checked against the original plan including newly triggered spending', () => {
  const plan = simple();
  plan.strategies[0].fields = [
    createField({ id: 'pay', amount: '100', direction: 'income' }),
    createField({ id: 'purchase', kind: 'once', amount: '1500', startAt: 'deposit' }),
  ];
  plan.milestones = target({ amount: '1500' });
  const runner = createScenarioRunner(plan);
  const goal = { metric: 'net', amount: '2000' };
  const answer = solveFor({ fields: plan.strategies[0].fields, fieldId: 'pay', knob: 'amount', milestone: goal, run: runner.run, read: toNumber });
  assert.equal(answer.answer, 292);
  assert.equal(answer.bound, 'checked', 'a conditional schedule promises this value, not every larger one');
  const applied = runner.run(updateField(plan.strategies[0].fields, 'pay', { amount: String(answer.answer) }));
  assert.equal(applied.totals.expenses, 1500);
  assert.equal(whenMet(applied, goal, toNumber).month, answer.month);
  assert.equal(applied.totals.net, 2004);
});

test('range scenarios retain operations that the central scenario has not triggered', () => {
  const plan = { months: 12, milestones: target({ metric: 'owned', amount: '1250' }) };
  const fields = [createField({ kind: 'asset', amount: '1000' }), createField({ kind: 'once', amount: '200', startAt: 'deposit' })];
  const runner = createScenarioRunner(plan);
  assert.equal(runner.run(fields).fields.length, 1);
  const { high } = runner.range(fields, 30);
  assert.equal(high.totals.expenses, 200);
  assert.equal(high.totals.worth, 1144.9);
});

test('referenced targets cannot be removed and appending plans keeps both sets of targets', () => {
  const current = simple();
  assert.equal(removeTarget(current, 'deposit'), null);
  const incoming = decodePlan(encodePlan(simple()));
  const combined = mergeSharedPlan(current, incoming);
  assert.equal(combined.plan.strategies.length, 2);
  assert.equal(combined.plan.milestones.length, 2);
  assert.deepEqual(missingTargets(combined.plan.strategies, combined.plan.milestones), []);
  for (const strategy of combined.plan.strategies) {
    assert.equal(createScenarioRunner(combined.plan).run(strategy.fields).totals.expenses, 3000);
  }
  const full = { ...current, milestones: Array.from({ length: 6 }, (_, i) => ({ id: `m${i}` })) };
  assert.equal(mergeSharedPlan(full, incoming).error, 'targetsFull');
});

test('field labels expose a missing target without silently changing a legacy plan', () => {
  const state = simple();
  state.milestones = [];
  const before = structuredClone(state);
  const labels = labelsForFields({ state, t: makeTranslator('fr') });
  assert.equal(labels.targets.length, 1);
  assert.equal(labels.targets[0].id, 'deposit');
  assert.ok(labels.targets[0].name.length > 0);
  assert.deepEqual(state, before);
});

test('three-decimal rates, negatives and French formatting agree with the financial model', () => {
  assert.equal(toRateNumber('3,125'), 3.125);
  assert.equal(monthlyRate('3,125'), monthlyRate('3.125'));
  assert.equal(monthlyGrowth('-0,125'), monthlyGrowth('-0.125'));
  assert.ok(Number.isNaN(toNumber('12oops')));
  setFormatLocale('fr-FR');
  assert.equal(formatRate('-15'), '-15');
  assert.equal(formatRate('2,5'), '2,5');
  assert.equal(formatRate('3,125'), '3,125');
});

test('a 48-month lease has one first rent and 47 ordinary rents', () => {
  const plan = templateOf('car').build(makeTranslator('fr'));
  for (const strategy of plan.strategies.slice(2)) {
    const first = strategy.fields.find((one) => one.labelKey === 'field.default.firstRent');
    const monthly = strategy.fields.find((one) => one.labelKey === 'field.default.leaseRent');
    assert.equal(contributionOf(monthly, 1), 0);
    assert.equal(fieldTotalOf(monthly, 48), 47 * Number(monthly.amount));
    assert.equal(fieldTotalOf(first, 48), Number(first.amount));
  }
});

test('loan repayments remain finite and continuous at zero interest', () => {
  for (const rate of [0, '0,000000000000001', 1e-15, 1e-8]) {
    assert.equal(loanPayment(1000, rate, 12), 83.33);
    const result = project({ months: 12, fields: [createField({ kind: 'loan', amount: '1000', termMonths: 12, annualRate: rate })] });
    assert.equal(result.totals.expenses, 999.96);
    assert.ok(Object.values(result.totals).every(Number.isFinite));
  }
});
