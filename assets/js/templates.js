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
 * One car, and the four ways of paying for it.
 *
 * **This template is a cost comparison, and that is why it is shaped unlike the
 * housing one.** Housing needed a salary and everyday costs in it, because the
 * question there is where you live and a plan with no income is an invoice
 * rather than a life. Here every plan gets the *same car* and differs only in
 * how it is paid for, so a household would shift all four by one number and
 * tell you nothing. Leave it out and `net` at the horizon is exactly what this
 * car cost you over four years, which is the figure the question is about.
 *
 * **Nobody sells the car, and nothing needs to.** The model cannot sell an
 * asset — `sellMonth` is honoured for investments only — but the comparison
 * does not want a sale. At month 48 the two plans that bought it own something
 * worth about 13,700 and the two that leased it own nothing, and that
 * difference is already in `worth`. Adding a sale would turn the same fact into
 * cash and change nothing except which tile it appears on.
 *
 * **The horizon is the contract**, 48 months, because comparing a four-year
 * lease against a purchase read over ten years compares two different
 * questions.
 *
 * The figures are a coherent set for a 25,000 € car over 48 months at 15,000 km
 * a year, which is the common shape of the offer in France: buying it costs its
 * price and leaves you the resale; buying it on a loan costs about 2,900 € more
 * in interest; the two leases cost less in total and leave you nothing. The
 * three rows people forget are all here — the registration on the two that buy,
 * the servicing that a long lease bundles and a lease-with-option does not, and
 * the return charges at the end of both leases.
 */
const CAR = Object.freeze({
  /** A 25,000 € car, four years, 15,000 km a year. */
  price: '25000',
  /**
   * What the car loses, as a yearly rate.
   *
   * The rate the model wants is not the rate the trade quotes, because
   * `monthlyGrowth` divides by twelve rather than compounding: −15 a year is a
   * monthly factor of 0.9875, and forty-eight of those leave 54.7% of the
   * price. On 25,000 € that is 13,669 € for the plan that owns it from month 0
   * and 13,842 € for the one that owns it from month 1, against the 13,500 € a
   * four-year-old car of that price fetches — within 1.3% and 2.5%, and a round
   * number rather than the −15.3 that would hit the first exactly.
   */
  decline: '-15',
  /** Registration. It varies by region and by how powerful the car is; this is
   *  an ordinary middle. Only the two plans that buy it pay this. */
  registration: '250',

  /* --------------------------------------------------------- buying it */
  loanRate: '5.5',
  term: 48,

  /* -------------------------------------------------------- leasing it */
  /** The first payment, larger than the rest. A lease with an option asks for
   *  more of it than a long lease does, and gives a smaller monthly in return. */
  loaFirst: '3000',
  loaRent: '320',
  lldFirst: '2500',
  lldRent: '350',
  /**
   * What it costs to hand the car back: wear beyond the normal, missing
   * equipment, kilometres over the allowance. It is the cost that surprises
   * people, it lands on both leases and on neither purchase, and the quoted
   * range is 800 to 1,500 €. The middle of it, once, in the last month.
   */
  returnFees: '1000',

  /* ------------------------------------------- what any car costs to run */
  insurance: '65',
  fuel: '130',
  /** Servicing and tyres. A long lease bundles this and a lease with an option
   *  does not, which is most of why its monthly is lower. */
  servicing: '40',
});

/** What any car costs whoever is driving it, however it was paid for. */
function carRunning() {
  const monthly = (labelKey, amount) => createField({
    labelKey, direction: 'expense', amount, startMonth: 1, synced: true,
  });
  return [
    monthly('field.default.carInsurance', CAR.insurance),
    monthly('field.default.fuel', CAR.fuel),
  ];
}

/** Servicing, which three of the four plans pay and the long lease bundles. */
function carServicing() {
  return createField({
    labelKey: 'field.default.servicing', direction: 'expense',
    amount: CAR.servicing, startMonth: 1,
  });
}

/**
 * The car as a thing you own: worth its price the month it is yours, and worth
 * less every month after. Only the two plans that buy it have one.
 *
 * **The month differs between them, and it has to.** Paying cash, the money
 * leaves in month 1 and the car is yours in month 1. On a loan the money
 * arrives the month before the first payment, so the debt appears in month 0
 * and the car has to appear with it — the keys and the debt change hands
 * together. Get this wrong either way and the plan opens a month either owning
 * a car it has not paid for or owing for one it does not have. Both start at
 * nought, which is the test that it is right.
 */
function carOwned(startMonth) {
  return createField({
    labelKey: 'field.default.car', kind: 'asset',
    amount: CAR.price, annualRate: CAR.decline, startMonth,
  });
}

function carRegistration() {
  return createField({
    labelKey: 'field.default.registration', kind: 'once', direction: 'expense',
    amount: CAR.registration, startMonth: 1,
  });
}

/** A lease: a large first payment, a monthly one, and the bill at the end for
 *  handing it back. */
function carLease(first, rent, servicing) {
  return [
    ...carRunning(),
    createField({
      labelKey: 'field.default.firstRent', kind: 'once', direction: 'expense',
      amount: first, startMonth: 1,
    }),
    createField({
      labelKey: 'field.default.leaseRent', direction: 'expense',
      amount: rent, startMonth: 1, endMonth: CAR.term,
    }),
    ...(servicing ? [carServicing()] : []),
    createField({
      labelKey: 'field.default.returnFees', kind: 'once', direction: 'expense',
      amount: CAR.returnFees, startMonth: CAR.term,
    }),
  ];
}

function buildCar(t) {
  return {
    nameKey: 'project.default.car',
    months: CAR.term,
    strategies: [
      createStrategy({
        nameKey: 'strategy.default.carCash',
        fields: [
          ...carRunning(),
          createField({
            labelKey: 'field.default.carPurchase', kind: 'once', direction: 'expense',
            amount: CAR.price, startMonth: 1,
          }),
          carRegistration(), carOwned(1), carServicing(),
        ],
      }),
      createStrategy({
        nameKey: 'strategy.default.carCredit',
        fields: [
          ...carRunning(),
          // Drawn in month 0, the month before the first payment, so all
          // forty-eight of them land inside a forty-eight month horizon and the
          // debt reaches nought exactly at the end of it.
          createField({
            labelKey: 'field.default.carCredit', kind: 'loan', direction: 'expense',
            amount: CAR.price, annualRate: CAR.loanRate, termMonths: CAR.term, startMonth: 1,
          }),
          carRegistration(), carOwned(0), carServicing(),
        ],
      }),
      // A lease with an option leaves the servicing to you.
      createStrategy({ nameKey: 'strategy.default.carLoa', fields: carLease(CAR.loaFirst, CAR.loaRent, true) }),
      // A long lease bundles it.
      createStrategy({ nameKey: 'strategy.default.carLld', fields: carLease(CAR.lldFirst, CAR.lldRent, false) }),
    ],
    milestones: [],
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
  Object.freeze({
    id: 'car',
    nameKey: 'project.default.car',
    noteKey: 'template.car.note',
    build: buildCar,
  }),
]);

/** The template with this id, or nothing — a store or a stale button may name
 *  one that a later build no longer has. */
export function templateOf(id) {
  return TEMPLATES.find((template) => template.id === id) || null;
}

export { HOUSING as HOUSING_PLAN, CAR as CAR_PLAN };
