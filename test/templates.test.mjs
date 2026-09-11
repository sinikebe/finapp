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

/* ------------------------------------------------------------------ the car */

const car = (language = 'en') => TEMPLATES.find((t) => t.id === 'car').build(makeTranslator(language));
const planNamed = (plan, key) => plan.strategies.find((s) => s.nameKey === `strategy.default.${key}`);

test('every way of paying for the car starts at nothing', () => {
  /*
   * The alignment that is easy to get wrong and silent when you do. Paying
   * cash, the money leaves in month 1 and the car is yours in month 1. On a
   * loan the money arrives the month *before* the first payment, so the debt
   * appears in month 0 and the car has to appear with it. Get either wrong and
   * the plan opens a month owning a car it has not paid for, or owing for one
   * it does not have — worth ±25,000 out of nowhere, on the first point of the
   * chart.
   */
  const plan = car();
  for (const strategy of plan.strategies) {
    const run = runOf(strategy, plan.months);
    const zero = run.points.find((p) => p.month === 0);
    assert.equal(Math.round(zero.worth), 0, `${strategy.nameKey} opens at nought`);
  }
});

test('the loan is drawn so that every payment lands inside the horizon', () => {
  // The horizon *is* the term. A loan drawn a month late puts its last payment
  // one month past the end, which reads as a car still half-owed for at a
  // horizon the contract says it is paid off at.
  const plan = car();
  const run = runOf(planNamed(plan, 'carCredit'), plan.months);
  const last = run.points[run.points.length - 1];
  assert.equal(Math.round(last.debt), 0, 'nothing is still owed at the horizon');
  const before = run.points.find((p) => p.month === plan.months - 1);
  assert.ok(before.debt > 0, 'and it was still being paid the month before');
});

test('the car is the same car in every plan, and the running costs are shared', () => {
  const plan = car();
  const syncedOf = (s) => s.fields.filter((f) => f.synced).map((f) => `${f.labelKey}:${f.amount}`).sort();
  const first = syncedOf(plan.strategies[0]);
  assert.deepEqual(first, ['field.default.carInsurance:65', 'field.default.fuel:130']);
  for (const strategy of plan.strategies.slice(1)) {
    assert.deepEqual(syncedOf(strategy), first, `${strategy.nameKey} runs the same car`);
  }
  // The two that buy it own something; the two that lease it own nothing. That
  // difference *is* the comparison, so nothing else may carry it.
  const owns = (s) => s.fields.some((f) => f.kind === 'asset');
  assert.deepEqual(plan.strategies.map(owns), [true, true, false, false]);
  assert.deepEqual(
    plan.strategies.map((s) => s.fields.some((f) => f.labelKey === 'field.default.registration')),
    [true, true, false, false],
    'only an owner pays to register it',
  );
  assert.deepEqual(
    plan.strategies.map((s) => s.fields.some((f) => f.labelKey === 'field.default.returnFees')),
    [false, false, true, true],
    'only a lease is handed back',
  );
  // The long lease bundles the servicing, which is most of why its monthly is
  // higher than the lease with an option.
  assert.deepEqual(
    plan.strategies.map((s) => s.fields.some((f) => f.labelKey === 'field.default.servicing')),
    [true, true, true, false],
    'a long lease is the one that includes it',
  );
});

test('what each way of paying comes to is the figure written down', () => {
  /*
   * Recomputed rather than asserted, so a rent or a rate that moves without the
   * module's comments following fails the build.
   *
   * These are checked against a published French comparison of the same 25,000
   * car over 48 months, and they reproduce it: subtract the rows that
   * comparison leaves out — the registration and the servicing on the plans
   * that pay them, and the charges for handing a lease back — and the two lease
   * totals come to 18,360 and 19,300 exactly, which are its figures.
   */
  const plan = car();
  const spent = (key) => {
    const run = runOf(planNamed(plan, key), plan.months);
    return Math.round(run.points[run.points.length - 1].expenses);
  };
  // Insurance and fuel are the same in all four and are not part of what is
  // being compared, so they come off before anything is held to a figure. Read
  // off the synced rows rather than typed here, so changing one changes both
  // sides of this sum at once.
  const running = plan.strategies[0].fields
    .filter((field) => field.synced)
    .reduce((total, field) => total + Number(field.amount) * plan.months, 0);
  assert.equal(running, 9360);

  assert.equal(spent('carLoa') - running - 1920 - 1000, 18360, 'the lease with an option');
  assert.equal(spent('carLld') - running - 1000, 19300, 'the long lease');
  // Interest on the loan is the gap between buying it outright and on credit.
  assert.equal(spent('carCredit') - spent('carCash'), 2908);

  // And the order the whole thing exists to establish: buying is cheaper than
  // leasing over four years, and the lease with an option costs *more* than the
  // long one, because it pays for its own servicing.
  const worth = plan.strategies.map((s) => {
    const run = runOf(s, plan.months);
    return Math.round(run.points[run.points.length - 1].worth);
  });
  assert.deepEqual(worth, [-22688, -25769, -30640, -29660]);
  assert.ok(worth[0] > worth[1], 'cash beats credit');
  assert.ok(worth[1] > worth[3], 'credit beats a long lease');
  assert.ok(worth[3] > worth[2], 'and a long lease beats one with an option');
});

test('a cost comparison carries no targets, and that is deliberate', () => {
  // Every plan front-loads differently, so a target on what has been spent is
  // met in month 1 by the one that paid cash and says nothing about the rest.
  // An empty list leaves the panel offering to mark one, which is honest; a
  // decorative target would not be.
  assert.deepEqual(car().milestones, []);
});

/* ------------------------------------------------------- how the shelf reads */

test('the figures are said to be examples once, for the shelf, and not per note', () => {
  /*
   * The claim was written at the end of every note, word for word the same, and
   * with two templates that was already 78px of a 320px phone spent saying one
   * sentence twice — at the end of an eight-line paragraph, which is where a
   * reader has stopped. It is said once now, in the shelf's own head, above
   * every button and so before any of them can be pressed.
   *
   * The failure this guards is a third template arriving with the habit: a note
   * ending in the claim would say it twice on one screen and start the drift
   * back. It is not held to the sentence being absent in spirit — only to the
   * dictionary's own claim not appearing inside a note, which is exactly the
   * copy-and-paste that would do it.
   */
  for (const language of LANGUAGES) {
    const claim = STRINGS[language]['template.claim'];
    assert.equal(typeof claim, 'string');
    assert.ok(claim.length > 20, `${language} says something`);
    for (const template of TEMPLATES) {
      const note = STRINGS[language][template.noteKey];
      assert.ok(
        !note.includes(claim),
        `${language}:${template.noteKey} repeats the shelf's claim; it is said once, above the buttons`,
      );
    }
  }
});

test('the shelf says how many templates there are', () => {
  /*
   * The one cue that survives the fold. A 320px phone shows the first template
   * and the top of the second, and with a third it will show less of the shelf
   * still; nothing in a list of prose blocks says how long the list is. So the
   * lead counts, and the count has to actually reach the reader — a phrase that
   * dropped the number would leave the sheet exactly where it was.
   */
  for (const language of LANGUAGES) {
    const many = STRINGS[language]['template.fromCount'];
    assert.equal(typeof many, 'function', `${language} counts them`);
    assert.equal(many.length, 1, `${language} takes the count`);
    assert.ok(
      many(TEMPLATES.length).includes(String(TEMPLATES.length)),
      `${language} names the number it was given`,
    );
    // And the singular stays a sentence rather than "one of 1 templates".
    assert.equal(typeof STRINGS[language]['template.from'], 'string');
  }
});
