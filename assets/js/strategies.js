/**
 * strategies.js — the strategies.
 *
 * A strategy is a named set of fields: "what I do now", "if I buy the flat",
 * "if I put the raise into the index fund". They share one horizon, so the
 * curves are comparable, and everything else about them is independent.
 *
 * The app always holds at least one. A reader who never compares anything sees
 * nothing of this: the single strategy is unnamed, and the comparison view
 * appears only once there is something to compare against.
 */

import { normalizeFields, createField, newId, MAX_FIELDS } from './fields.js';

/**
 * Four is the ceiling because four is how many series colours the palette can
 * seat while every pair stays distinguishable — including for a reader with
 * colour-vision deficiency, in both themes. A fifth strategy would have to be
 * told apart by name alone.
 */
export const MAX_STRATEGIES = 4;

export const MAX_NAME_LENGTH = 40;

/** Coerce anything into a well-formed strategy. */
export function normalizeStrategy(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    id: typeof source.id === 'string' && source.id ? source.id : newId(),
    // Empty means unnamed: the bar shows its position instead, translated, so
    // an untouched strategy follows the language like an untouched field does.
    name: typeof source.name === 'string' ? source.name.trim().slice(0, MAX_NAME_LENGTH) : '',
    // A name the app gave it, so the plans it opens with follow the language
    // the way an untouched field's does. The reader's own name wins over it,
    // exactly as a field's label wins over its labelKey.
    nameKey: typeof source.nameKey === 'string' ? source.nameKey : '',
    fields: normalizeFields(source.fields),
  };
}

/** Coerce anything into a list with at least one strategy and unique ids. */
export function normalizeStrategies(value) {
  const list = (Array.isArray(value) ? value : []).slice(0, MAX_STRATEGIES);
  const seen = new Set();
  const strategies = list.map((entry) => {
    const strategy = normalizeStrategy(entry);
    if (seen.has(strategy.id)) strategy.id = newId();
    seen.add(strategy.id);
    return strategy;
  });
  return strategies.length ? strategies : [normalizeStrategy({})];
}

export function createStrategy(patch = {}) {
  return normalizeStrategy({ ...patch, id: patch.id || newId() });
}

/** What to call a strategy: the reader's name, else its position. */
export function nameOf(strategy, index, t) {
  if (strategy.name) return strategy.name;
  if (strategy.nameKey) {
    // A translator hands back the key it does not know; a key stored by another
    // version should read as unnamed, not as `strategy.default.loan`.
    const translated = t(strategy.nameKey);
    if (translated !== strategy.nameKey) return translated;
  }
  return t('strategy.defaultName', index + 1);
}

/** The id that should be active: the one asked for, if it still exists. */
export function activeIdOf(strategies, wanted) {
  const list = normalizeStrategies(strategies);
  return list.some((strategy) => strategy.id === wanted) ? wanted : list[0].id;
}

/* ------------------------------------------------------------- operations */
/* All of these return a new list; none mutate the one they are given. */

export function addStrategy(strategies, patch = {}) {
  const list = normalizeStrategies(strategies);
  if (list.length >= MAX_STRATEGIES) return list;
  return [...list, createStrategy(patch)];
}

export function updateStrategy(strategies, id, patch = {}) {
  return normalizeStrategies(strategies).map(
    (strategy) => (strategy.id === id ? normalizeStrategy({ ...strategy, ...patch, id: strategy.id }) : strategy),
  );
}

/**
 * Copy a strategy, fields and all, right after the original — the usual way to
 * start a comparison is "the same, but…".
 * @param {(name: string) => string} nameCopy how to name the copy
 */
export function duplicateStrategy(strategies, id, nameCopy, t) {
  const list = normalizeStrategies(strategies);
  const index = list.findIndex((strategy) => strategy.id === id);
  if (index === -1 || list.length >= MAX_STRATEGIES) return list;

  const source = list[index];
  const copy = createStrategy({
    // Fields are copied with new ids, so editing one strategy never reaches
    // into another — except a synced field, which keeps its id precisely
    // because reaching into the others is the whole point of it.
    fields: source.fields.map(
      (field) => (field.synced ? { ...field } : { ...field, id: newId() }),
    ),
    // A copy of something named is "that, again"; a copy of something unnamed
    // stays unnamed and simply takes the next position.
    name: source.name ? nameCopy(nameOf(source, index, t)) : '',
  });
  return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
}

/** Remove a strategy. The list never empties: the last one stays. */
export function removeStrategy(strategies, id) {
  const list = normalizeStrategies(strategies);
  if (list.length <= 1) return list;
  return list.filter((strategy) => strategy.id !== id);
}

/* --------------------------------------------------------------- syncing */

/** What the reader calls a field, for matching one across strategies. */
function nameKeyOf(field) {
  return field.label || field.labelKey || '';
}

/**
 * Put one field into every strategy: the same field, with the same id.
 *
 * A counterpart is looked for by id first — the case once a field is already
 * synced — and by name second. That second rule is what lets syncing work on
 * strategies built before anyone thought to link them: two lists that both say
 * "Income" mean the same income, and after the first spread their ids agree, so
 * the name is never consulted again. A strategy with no counterpart at all
 * gains the field, because a synced field exists everywhere by definition.
 */
export function spreadField(strategies, field) {
  return normalizeStrategies(strategies).map((strategy) => {
    const { fields } = strategy;
    let index = fields.findIndex((entry) => entry.id === field.id);
    if (index === -1) {
      // Never adopt a field that is already following something else.
      index = fields.findIndex((entry) => !entry.synced && nameKeyOf(entry) === nameKeyOf(field));
    }
    if (index === -1) {
      if (fields.length >= MAX_FIELDS) return strategy;
      return { ...strategy, fields: [...fields, { ...field }] };
    }
    return {
      ...strategy,
      fields: fields.map((entry, at) => (at === index ? { ...field } : entry)),
    };
  });
}

/** Stop a field following the others. Every copy keeps what it has now, and
 *  they go their separate ways from here. */
export function unlinkField(strategies, fieldId) {
  return normalizeStrategies(strategies).map((strategy) => ({
    ...strategy,
    fields: strategy.fields.map(
      (field) => (field.id === fieldId ? { ...field, synced: false } : field),
    ),
  }));
}

/** Take a synced field out of every strategy at once: it is one field, so
 *  removing it in one place is removing it. */
export function removeEverywhere(strategies, fieldId) {
  return normalizeStrategies(strategies).map((strategy) => ({
    ...strategy,
    fields: strategy.fields.filter((field) => field.id !== fieldId),
  }));
}

/** Which strategy takes over when `id` goes: the next, else the previous. */
export function neighbourOf(strategies, id) {
  const list = normalizeStrategies(strategies);
  const index = list.findIndex((strategy) => strategy.id === id);
  if (index === -1) return list[0].id;
  const neighbour = list[index + 1] || list[index - 1] || list[0];
  return neighbour.id;
}

/**
 * Carry a store from before strategies existed — a bare list of fields — into
 * one unnamed strategy, so nobody loses what they had entered.
 */
export function migrateFields(fields) {
  return [createStrategy({ fields })];
}

/* ------------------------------------------------------------ the first run */

/**
 * One question — *how should I buy a 100,000 house?* — asked three ways, so a
 * reader arrives at something worth reading rather than an empty form.
 *
 * Every figure below is a round, ordinary one for a French household, and all
 * three plans spend **exactly the same** on housing each month: the loan's
 * repayment. The renters pay less rent than that and invest the difference, so
 * nothing is compared against a plan that quietly saves more.
 *
 * **The buy months are computed, not chosen.** "As soon as savings reach
 * 100,000" is not something the model can express — nothing here is
 * conditional — so the month each plan can afford the house was worked out
 * from these very figures and written down. A test recomputes them and fails
 * if a figure is changed without the months following, which is the only way
 * a hard-coded answer stays honest.
 */
const PLAN = Object.freeze({
  salary: '2200',
  living: '1000',
  rent: '500',
  house: '100000',
  loanRate: '3',
  term: 240,
  growth: '1.5',
  tax: '800',
  fundRate: '6',
  /** The loan's repayment less the rent: what a renter has spare each month. */
  spare: '54.60',
  /**
   * What housing stops costing once it is paid for — the whole repayment, less
   * the property tax that replaces it. It goes back into the fund, in every
   * plan, from the month that plan stops paying for its housing. Anything else
   * would compare what people do with spare cash rather than when they bought.
   */
  after: '487.93',
  /**
   * Months between getting the keys and the first property-tax bill. It is
   * levied on whoever owns in January and billed the autumn after, so it never
   * lands on the day of the purchase — which is just as well, since a buyer
   * who has spent everything on the house cannot pay a bill that same month.
   */
  taxLag: 6,
  /** Cash alone covers the house here. */
  buyOnCash: 155,
  /** Cash plus the fund, cashed in, covers it sixteen months sooner. */
  buyOnBoth: 139,
});

export function defaultStrategies() {
  // The same field in all three, sharing one id: your pay does not change
  // because you chose a different way to buy, and neither does the shopping.
  const salary = createField({
    labelKey: 'field.default.salary', direction: 'income', amount: PLAN.salary, synced: true,
  });
  const living = createField({
    labelKey: 'field.default.living', direction: 'expense', amount: PLAN.living, synced: true,
  });
  const shared = () => [{ ...salary }, { ...living }];

  // A renter's plan, which differs only in the month it can afford the house
  // and in whether the fund is sold to get there.
  const renting = (buy, sellTheFund) => [
    ...shared(),
    createField({
      labelKey: 'field.default.rent', direction: 'expense', amount: PLAN.rent, endMonth: buy,
    }),
    createField({
      labelKey: 'field.default.fund',
      kind: 'investment',
      amount: PLAN.spare,
      annualRate: PLAN.fundRate,
      // Sold to help buy, or simply left alone once there is no rent to beat.
      ...(sellTheFund ? { sellMonth: buy } : { endMonth: buy }),
    }),
    createField({
      labelKey: 'field.default.purchase', kind: 'once', direction: 'expense',
      amount: PLAN.house, startMonth: buy,
    }),
    createField({
      labelKey: 'field.default.house', kind: 'asset',
      amount: PLAN.house, annualRate: PLAN.growth, startMonth: buy,
    }),
    createField({
      labelKey: 'field.default.propertyTax', direction: 'expense',
      amount: PLAN.tax, periodMonths: 12, startMonth: buy + PLAN.taxLag,
    }),
    // The month after the last rent: the housing money is free again, so it
    // goes where it was going before.
    createField({
      labelKey: 'field.default.fundAfter', kind: 'investment',
      amount: PLAN.after, annualRate: PLAN.fundRate, startMonth: buy + 1,
    }),
  ];

  return [
    createStrategy({
      nameKey: 'strategy.default.loan',
      fields: [
        ...shared(),
        createField({
          labelKey: 'field.default.mortgage', kind: 'loan', direction: 'expense',
          amount: PLAN.house, annualRate: PLAN.loanRate, termMonths: PLAN.term, startMonth: 1,
        }),
        // Owned from month 0, because that is when the loan's money arrives —
        // the keys and the debt change hands together. Start it a month later
        // and the plan opens owing 100,000 for a house it does not yet own.
        createField({
          labelKey: 'field.default.house', kind: 'asset',
          amount: PLAN.house, annualRate: PLAN.growth,
        }),
        createField({
          labelKey: 'field.default.propertyTax', direction: 'expense',
          amount: PLAN.tax, periodMonths: 12, startMonth: PLAN.taxLag,
        }),
        // The borrower's housing is paid for when the last repayment lands, so
        // this does nothing inside the default horizon — and everything beyond
        // it, which is exactly why it is here rather than left out.
        createField({
          labelKey: 'field.default.fundAfter', kind: 'investment',
          amount: PLAN.after, annualRate: PLAN.fundRate, startMonth: PLAN.term + 1,
        }),
      ],
    }),
    createStrategy({ nameKey: 'strategy.default.saveUp', fields: renting(PLAN.buyOnCash, false) }),
    createStrategy({ nameKey: 'strategy.default.sellFund', fields: renting(PLAN.buyOnBoth, true) }),
  ];
}

export { PLAN as DEFAULT_PLAN };
