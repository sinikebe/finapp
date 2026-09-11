/**
 * templates.js — a project that arrives with its figures already in it.
 *
 * A blank project is the right thing to start from when you know what you are
 * asking. It is the wrong thing when you do not yet know *which questions the
 * subject has* — and housing has a dozen of them, half of which a first-timer
 * finds out about by being surprised by a bill. So a template is not a
 * convenience for typing faster; it is the list of things worth putting a
 * number against, with a plausible number already there to argue with.
 *
 * ## Every figure here is an example, and is meant to be replaced
 *
 * The app cannot know a reader's city, their rate, or their tax bracket. What
 * it can do is arrive with a *complete* set of rows, so that changing four of
 * them is a five-minute job and forgetting the landlord's insurance is not. The
 * numbers below are round and ordinary rather than precise, and the note each
 * template carries says so in both languages before the reader presses it.
 *
 * ## A template is built, not stored
 *
 * `build(t)` returns strategies, targets and a horizon, made fresh with new ids
 * every time — the same shape `defaultStrategies()` returns, and for the same
 * reason: nothing here is a document, so nothing here needs a version.
 *
 * Names go through the dictionary wherever the model has a slot for a key —
 * `labelKey` on a field, `nameKey` on a strategy and on the project — so a
 * template's rows follow the reader's language exactly as the worked example's
 * do. A target has no such slot (its name is a plain string, because a target's
 * name is what a *field* refers to it by), so those are written in the language
 * the reader had when they pressed the button. That is the same contract as a
 * name they typed themselves, which is what choosing a template amounts to.
 */

import { createField } from './fields.js';
import { createStrategy } from './strategies.js';

/**
 * One flat, bought with a loan, and the two things you can do with it.
 *
 * **The comparison is live in it against let it out**, and the whole design is
 * that the property is identical in every plan: same price, same fees, same
 * works, same loan, same property tax, same building charges, all marked
 * synced. What varies is what happens after the keys change hands. Three of the
 * four plans let it out, differing only in the tax regime, so the sheet answers
 * two questions at once and the second is nested inside the first.
 *
 * **The row that makes it a fair comparison is the rent you pay elsewhere.** A
 * landlord has to live somewhere. Leave that out and letting looks like income
 * for nothing, which is the single most common way this sum is got wrong —
 * so the letting plans carry a rent, and the plan that lives in the flat does
 * not, because that is exactly what buying to live in buys you. It is set lower
 * than the rent received on purpose: letting the better flat and living in a
 * smaller one is the case where the sums are close enough to be worth doing.
 *
 * There is deliberately **no deposit row**. Money the reader brings from their
 * own savings is not income, and adding it as one would overstate what the plan
 * is worth by exactly that amount at every month. Instead the plan opens the
 * way the purchase really leaves you: cash down by what you spent, a debt the
 * size of the loan, and a flat the size of the price. Net worth starts at minus
 * your deposit and climbs as the loan comes down — the true shape of the thing.
 */
const HOUSING = Object.freeze({
  /**
   * The household the decision sits inside.
   *
   * A housing plan with no income in it is not a plan, it is an invoice: every
   * curve falls for ever and net worth never turns, so the two ways of housing
   * yourself can only be told apart by which falls faster. These two rows are
   * the same in all four plans and marked synced — your pay does not change
   * because you let the flat out — and they put the decision back inside a
   * life, which is what makes the targets and the net-worth curve mean
   * anything. Everyday costs exclude housing, because housing is the subject.
   */
  salary: '2600',
  living: '1100',
  /** A small flat in a city with real letting demand. */
  price: '150000',
  /** Around 8% of the price, which is what the older stock costs to buy. */
  notary: '12000',
  /** Enough to take a poor energy rating up to something that can still be let:
   *  a rating a landlord cannot let is not a discount, it is a bill. */
  works: '20000',
  /** Furnished either way — you furnish your own home too, and the furnished
   *  letting regimes require it. */
  furniture: '5000',
  loanRate: '3.06',
  /** Twenty-five years, and the horizon is the same, so the plan runs to the
   *  month the debt reaches zero and no further. */
  term: 300,
  /** The whole price borrowed: the deposit goes on the fees, works and
   *  furniture above, which is what a 10% deposit actually pays for. */
  borrow: '150000',
  /** What property does over a long horizon, kept modest on purpose. */
  growth: '1',
  propertyTax: '1100',
  /** The building's charges. The part a landlord cannot pass on is smaller than
   *  the part an occupier pays, so this is the shared floor and the occupier's
   *  own share sits in their plan. */
  copro: '60',
  coproLiving: '45',
  homeInsurance: '250',

  /* ------------------------------------------------------- letting it out */
  rent: '800',
  /** Two weeks a year empty, which is the usual provision. */
  vacancy: '32',
  /** An agent, at the middle of the usual band. */
  lettingFees: '64',
  /** Cover against a tenant who stops paying. */
  guarantee: '24',
  landlordInsurance: '150',
  /** Where the landlord lives: a smaller flat than the one they own. Without
   *  this row the comparison is not a comparison. */
  rentElsewhere: '650',

  /**
   * The net-worth mark the targets watch for, and it is measured rather than
   * chosen. It has to clear two bars: high enough that the plans reach it at
   * visibly different months, and low enough that every one of them reaches it
   * inside the horizon. A hundred thousand does both — month 117 letting it out
   * and writing it down, 118 on the scheme, 126 living in it, and 149 on the
   * flat allowance, so the regime that costs the most is nearly three years
   * behind and the sheet says so without anybody reading a total. A test
   * recomputes all four and fails if a figure above moves without the months
   * following, which is the only way a written-down answer stays honest.
   */
  worthTarget: '100000',
});

/** The household and the flat: what you earn, what you spend on everything
 *  else, and what the property cost, is worth and owes. The same nine rows in
 *  all four plans, synced, because none of it is what is being compared. */
function housingShared() {
  const once = (labelKey, amount) => createField({
    labelKey, kind: 'once', direction: 'expense', amount, startMonth: 1, synced: true,
  });
  return [
    createField({
      labelKey: 'field.default.salary', direction: 'income',
      amount: HOUSING.salary, synced: true,
    }),
    createField({
      labelKey: 'field.default.living', direction: 'expense',
      amount: HOUSING.living, synced: true,
    }),
    once('field.default.notary', HOUSING.notary),
    once('field.default.works', HOUSING.works),
    once('field.default.furniture', HOUSING.furniture),
    // The debt and the keys change hands in the same month, so the flat is
    // owned from the outset — exactly as the worked example's house is. Start
    // it later and the plan opens owing the price of something it does not yet
    // have.
    createField({
      labelKey: 'field.default.property', kind: 'asset',
      amount: HOUSING.price, annualRate: HOUSING.growth, synced: true,
    }),
    createField({
      labelKey: 'field.default.mortgage', kind: 'loan', direction: 'expense',
      amount: HOUSING.borrow, annualRate: HOUSING.loanRate, termMonths: HOUSING.term,
      startMonth: 1, synced: true,
    }),
    // Yearly, and not in the first year: it falls on whoever owns in January
    // and is billed the autumn after, so it never lands on the day of purchase.
    createField({
      labelKey: 'field.default.propertyTax', direction: 'expense',
      amount: HOUSING.propertyTax, periodMonths: 12, startMonth: 12, synced: true,
    }),
    createField({
      labelKey: 'field.default.coproCharges', direction: 'expense',
      amount: HOUSING.copro, startMonth: 1, synced: true,
    }),
  ];
}

/** Living in it: no rent received, and — the point of the whole exercise — no
 *  rent paid either. */
function livingIn() {
  return [
    ...housingShared(),
    createField({
      labelKey: 'field.default.coproLiving', direction: 'expense',
      amount: HOUSING.coproLiving, startMonth: 1,
    }),
    createField({
      labelKey: 'field.default.homeInsurance', direction: 'expense',
      amount: HOUSING.homeInsurance, periodMonths: 12, startMonth: 12,
    }),
  ];
}

/**
 * Letting it out, under one tax regime.
 *
 * Two numbers say which regime: how much tax a year, and the month the first
 * bill lands. A regime that writes the property down against the rents does not
 * abolish the tax, it postpones it — so the month matters as much as the
 * amount, and a comparison showing only the amount would make a regime that
 * postpones look identical to one that does not.
 */
function lettingOut(taxAmount, taxStart) {
  const monthly = (labelKey, amount) => createField({
    labelKey, direction: 'expense', amount, startMonth: 1,
  });
  return [
    ...housingShared(),
    createField({
      labelKey: 'field.default.rentReceived', direction: 'income',
      amount: HOUSING.rent, startMonth: 1,
    }),
    // An expense rather than a smaller rent, because a reader changing the rent
    // should not have to remember to change a second figure with it — and
    // because what a fortnight of emptiness costs is worth seeing on its own.
    monthly('field.default.vacancy', HOUSING.vacancy),
    monthly('field.default.lettingFees', HOUSING.lettingFees),
    monthly('field.default.rentGuarantee', HOUSING.guarantee),
    createField({
      labelKey: 'field.default.landlordInsurance', direction: 'expense',
      amount: HOUSING.landlordInsurance, periodMonths: 12, startMonth: 12,
    }),
    // The row without which this is not a comparison.
    monthly('field.default.rentElsewhere', HOUSING.rentElsewhere),
    createField({
      labelKey: 'field.default.rentTax', direction: 'expense',
      amount: taxAmount, periodMonths: 12, startMonth: taxStart,
    }),
  ];
}

function buildHousing(t) {
  return {
    nameKey: 'project.default.liveOrLet',
    months: HOUSING.term,
    strategies: [
      createStrategy({ nameKey: 'strategy.default.liveIn', fields: livingIn() }),
      // Writing the flat down against the rents covers them for about ten
      // years; what is left is taxed after that.
      createStrategy({ nameKey: 'strategy.default.letLmnp', fields: lettingOut('1400', 121) }),
      // A flat allowance instead, so tax starts with the first full year and
      // never stops.
      createStrategy({ nameKey: 'strategy.default.letMicro', fields: lettingOut('3300', 13) }),
      // A write-down bought with a letting commitment, so the postponement ends
      // when the commitment does.
      createStrategy({ nameKey: 'strategy.default.letScheme', fields: lettingOut('1200', 109) }),
    ],
    milestones: [
      { name: t('template.target.debtClear'), metric: 'debt', amount: '0' },
      { name: t('template.target.worth'), metric: 'worth', amount: HOUSING.worthTarget },
    ],
  };
}

/**
 * The templates on offer, in the order the sheet lists them.
 *
 * A list rather than a map, because the order is part of it and an object's is
 * not something to rely on. Adding one is an entry here plus its strings; the
 * sheet, the command and the store need no changes at all.
 */
export const TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'housing',
    nameKey: 'project.default.liveOrLet',
    noteKey: 'template.housing.note',
    build: buildHousing,
  }),
]);

/** The template with this id, or nothing — a store or a stale button may name
 *  one that a later build no longer has. */
export function templateOf(id) {
  return TEMPLATES.find((template) => template.id === id) || null;
}

export { HOUSING as HOUSING_PLAN };
