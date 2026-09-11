import test from 'node:test';
import assert from 'node:assert/strict';

import { TEMPLATES, templateOf, HOUSING_PLAN } from '../assets/js/templates.js';
import { STRINGS, LANGUAGES, makeTranslator } from '../assets/js/i18n.js';
import { normalizeFields, MAX_FIELDS } from '../assets/js/fields.js';
import { normalizeStrategies, MAX_STRATEGIES } from '../assets/js/strategies.js';
import { normalizeMilestones, MAX_MILESTONES, whenMet } from '../assets/js/milestones.js';
import { project } from '../assets/js/projection.js';

const METRICS = ['net', 'worth', 'income', 'expenses', 'invested', 'profit', 'owned', 'debt'];
const read = (value) => Number(String(value).replace(',', '.')) || 0;
const built = (language = 'en') => TEMPLATES[0].build(makeTranslator(language));

const runOf = (strategy, months) => project({
  fields: normalizeFields(strategy.fields), months, inflation: 0, spread: 0, tax: 0,
});

/* --------------------------------------------------------- what it is made of */

test('a template survives the model\'s own coercion unchanged', () => {
  /*
   * The one thing a template must not do is put a value in the app that the app
   * could not have made itself — it is built in code, so nothing coerces it on
   * the way in the way a link or a store is coerced. So every plan is run
   * through the same normalisation a share link goes through, and has to come
   * out the same size it went in.
   */
  for (const template of TEMPLATES) {
    const plan = template.build(makeTranslator('en'));
    const strategies = normalizeStrategies(plan.strategies);
    assert.equal(strategies.length, plan.strategies.length, `${template.id}: no plan is dropped`);
    assert.ok(strategies.length <= MAX_STRATEGIES, `${template.id}: within the palette`);
    for (const [index, strategy] of strategies.entries()) {
      const fields = normalizeFields(plan.strategies[index].fields);
      assert.equal(fields.length, plan.strategies[index].fields.length, 'no field is dropped');
      assert.ok(fields.length <= MAX_FIELDS);
      for (const field of fields) {
        // An empty labelKey means the allowlist rejected it and the row would
        // arrive nameless — the exact failure a typo here would cause.
        assert.notEqual(field.labelKey, '', `${template.id}: every row keeps its name key`);
        assert.notEqual(field.amount, '', `${template.id}: every row has a figure`);
      }
      assert.notEqual(strategy.nameKey, '', `${template.id}: every plan keeps its name key`);
    }
    const milestones = normalizeMilestones(plan.milestones, METRICS);
    assert.equal(milestones.length, plan.milestones.length);
    assert.ok(milestones.length <= MAX_MILESTONES);
    for (const milestone of milestones) {
      assert.notEqual(milestone.name, '', 'a target with no name is one nothing can wait on');
      assert.ok(METRICS.includes(milestone.metric));
    }
  }
});

test('every name a template uses is in both dictionaries', () => {
  /*
   * A template is the one place the app writes dictionary keys by hand rather
   * than beside their strings, so a typo here is a row called
   * `field.default.furnitre` on somebody's screen. The i18n tests hold the two
   * languages to each other; this holds the template to both of them.
   */
  for (const template of TEMPLATES) {
    const plan = template.build(makeTranslator('en'));
    const keys = new Set([template.nameKey, template.noteKey, plan.nameKey]);
    for (const strategy of plan.strategies) {
      keys.add(strategy.nameKey);
      for (const field of strategy.fields) keys.add(field.labelKey);
    }
    for (const language of LANGUAGES) {
      for (const key of keys) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(STRINGS[language], key),
          `${language} carries ${key}`,
        );
      }
    }
  }
});

test('two projects from one template share nothing', () => {
  // Built fresh every time, ids and all: two projects from the same button that
  // shared a field object would edit each other.
  const a = built();
  const b = built();
  const idsOf = (plan) => plan.strategies.flatMap((s) => [s.id, ...s.fields.map((f) => f.id)]);
  const overlap = idsOf(a).filter((id) => idsOf(b).includes(id));
  assert.deepEqual(overlap, [], 'no id appears in both');
  a.strategies[0].fields[0].amount = '999999';
  assert.notEqual(b.strategies[0].fields[0].amount, '999999');
});

test('a target is named in the language it was started in', () => {
  // A target's name is a plain string — it is what a *field* refers to it by,
  // so it has no dictionary slot. The template writes it in the reader's
  // language at the moment they press, which is the same contract as a name
  // they typed.
  assert.equal(built('en').milestones[0].name, 'Loan cleared');
  assert.equal(built('fr').milestones[0].name, 'Crédit remboursé');
});

test('an id nothing ships is not a template', () => {
  assert.equal(templateOf('housing').id, 'housing');
  assert.equal(templateOf('nope'), null);
  assert.equal(templateOf(undefined), null);
});

/* ------------------------------------------------- what the figures come to */

test('the property is the same in all four plans, and only the letting differs', () => {
  /*
   * The whole design of this template in one assertion. If the plans differed
   * in the flat as well as in what is done with it, the comparison would answer
   * "which of these four properties?" instead of "live in it or let it out?".
   */
  const plan = built();
  const syncedOf = (strategy) => strategy.fields
    .filter((field) => field.synced)
    .map((field) => `${field.labelKey}:${field.amount}`)
    .sort();
  const first = syncedOf(plan.strategies[0]);
  assert.ok(first.length >= 9, 'the household and the flat are held in common');
  for (const strategy of plan.strategies.slice(1)) {
    assert.deepEqual(syncedOf(strategy), first, `${strategy.nameKey} holds the same property`);
  }
  // And the one row that makes it a fair comparison is on the letting plans and
  // not on the one that lives there: a landlord has to live somewhere.
  const has = (strategy, key) => strategy.fields.some((field) => field.labelKey === key);
  assert.equal(has(plan.strategies[0], 'field.default.rentElsewhere'), false);
  assert.equal(has(plan.strategies[0], 'field.default.rentReceived'), false);
  for (const strategy of plan.strategies.slice(1)) {
    assert.equal(has(strategy, 'field.default.rentElsewhere'), true, `${strategy.nameKey} pays rent somewhere`);
    assert.equal(has(strategy, 'field.default.rentReceived'), true);
  }
});

test('the months the plans reach the target are the ones written down', () => {
  /*
   * The figures in `HOUSING_PLAN` and the months its comment names are one fact
   * stated in two places. This recomputes them, so changing the rent without
   * changing the comment fails the build rather than quietly shipping a
   * paragraph that describes a plan the app no longer has.
   *
   * They are also the template's whole claim: the regimes are far enough apart
   * to be worth comparing, and near enough that the reader's own figures decide
   * it rather than the example's.
   */
  const plan = built();
  const reached = plan.strategies.map((strategy) => {
    const met = whenMet(
      runOf(strategy, plan.months),
      { metric: 'worth', amount: HOUSING_PLAN.worthTarget },
      read,
    );
    return met.month;
  });
  assert.deepEqual(reached, [126, 117, 149, 118]);

  // And the debt goes to nothing exactly at the horizon, because the horizon is
  // the term: a plan that ran past its own loan would spend its last years
  // saying nothing.
  for (const strategy of plan.strategies) {
    const met = whenMet(runOf(strategy, plan.months), { metric: 'debt', amount: '0' }, read);
    assert.equal(met.month, plan.months, `${strategy.nameKey} clears at the horizon`);
  }
});

test('letting it out is close enough that the reader\'s own figures decide it', () => {
  /*
   * A template whose answer is obvious teaches nothing: nobody reads four plans
   * to be told the one they already believed. These four sit within a few
   * thousand of each other over twenty-five years except the flat allowance,
   * which is the one the report this came from says people pick by accident.
   */
  const plan = built();
  const worth = plan.strategies.map((strategy) => {
    const run = runOf(strategy, plan.months);
    return Math.round(run.points[run.points.length - 1].worth);
  });
  const [liveIn, lmnp, micro, scheme] = worth;
  assert.ok(Math.abs(lmnp - liveIn) < 10000, 'writing it down and living in it are near neighbours');
  assert.ok(Math.abs(scheme - liveIn) < 10000, 'so is the scheme');
  assert.ok(liveIn - micro > 40000, 'and the flat allowance is the one that costs real money');
  for (const value of worth) assert.ok(value > 0, 'every plan ends ahead');
});
