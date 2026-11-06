/** Read-only field presentation, separated from commands and persistence. */
import { annualPercent } from './numbers.js';
import { labelOf } from './fields.js';
import { missingTargets, TARGET_REFS } from './plan-operations.js';
import { toAmount, lastLandingOf, yearsRunning, grownBy, borrowedOf, loanPayment, loanInterest, loanTotal } from './projection.js';
import { formatAmount, formatRate } from './format.js';

export function labelsForFields({ state, placed, t }) {
  const months = (placed && placed.months) || new Map();
  // The named targets a month may wait on, and what each resolved to. Both
  // come from the schedule the projection was built from, so the month a row
  // shows is the month the curve above it was drawn with. Named here rather
  // than written inline, because `saidFor` below has to look a target up by id
  // to say its name, and two copies of the same list would be one too many.
  const referred = new Set(state.strategies.flatMap((strategy) => strategy.fields.flatMap(
    (field) => TARGET_REFS.map((key) => field[key]).filter(Boolean),
  )));
  const targets = state.milestones.filter((one) => one.name || referred.has(one.id))
    .map((one) => ({ id: one.id, name: one.name || t('milestone.unnamed') }));
  for (const id of missingTargets(state.strategies, state.milestones)) {
    targets.push({ id, name: t('milestone.missing') });
  }
  return {
    targets,
    atMonth: t('field.atMonth'),
    atAria: (name) => t('field.atAria', name),
    monthSaid: (id) => {
      const month = months.get(id);
      return Number.isFinite(month) ? t('field.atMet', month) : t('field.atNotYet');
    },
    name: t('field.name'),
    namePlaceholder: t('field.namePlaceholder'),
    direction: t('field.direction'),
    amount: t('field.amount'),
    period: t('field.period'),
    periodName: (months) => t(`field.period.${months}`),
    kind: t('field.kind'),
    kindName: (kind) => t(`field.kind.${kind}`),
    amountFor: (kind) => t(`field.amount.${kind}`),
    rateFor: (kind) => t(`field.rate.${kind}`),
    ratePlaceholder: t('field.ratePlaceholder'),
    term: t('field.term'),
    from: t('field.from'),
    to: t('field.to'),
    fromWord: t('field.fromWord'),
    fromWordShort: t('field.fromWordShort'),
    toWord: t('field.toWord'),
    ownedFrom: t('field.ownedFrom'),
    sell: t('field.sell'),
    sellWord: t('field.sellWord'),
    sellWordShort: t('field.sellWordShort'),
    toWordShort: t('field.toWordShort'),
    onceMonth: t('field.onceMonth'),
    onceWord: t('field.onceWord'),
    onceWordShort: t('field.onceWordShort'),
    rateUnit: t('field.rateUnit'),
    rateUnitShort: t('field.rateUnitShort'),
    fees: t('field.fees'),
    feesUnit: t('field.feesUnit'),
    feesUnitShort: t('field.feesUnitShort'),
    termUnit: t('field.termUnit'),
    termUnitShort: t('field.termUnitShort'),
    // Only worth spelling out once it actually climbs, and only as far as the
    // horizon on screen — the number moves with the slider, which is the point.
    growthSummary: (field) => {
      const rate = annualPercent(field.annualRate, field.kind === 'loan' ? 0 : -100);
      if (!Number.isFinite(rate) || rate === 0 || !toAmount(field.amount)) return '';
      // The month the field last lands on, not the horizon: a yearly amount
      // over twenty months last landed at month 12, and quoting the horizon
      // named a figure the projection never uses — 1,050 by month 20 for a
      // field that moved 1,000 and will not move again until month 24.
      const lands = lastLandingOf(field, state.months);
      if (!lands) return '';
      const years = yearsRunning(field, lands);
      if (years < 1) return '';
      return t(
        'field.growthSummary',
        formatRate(rate),
        formatAmount(grownBy(field.amount, field.annualRate, years)),
        lands,
      );
    },
    // Two sentences, because with no fees the borrowed sum is the amount that
    // was typed and saying it back would be noise. With fees it is the one
    // thing the reader cannot see: they entered what they need, not what the
    // bank will lend.
    loanSummary: (field) => {
      const borrowed = borrowedOf(field);
      const payment = formatAmount(loanPayment(borrowed, field.annualRate, field.termMonths));
      const interest = formatAmount(loanInterest(field));
      const total = formatAmount(loanTotal(field));
      if (toAmount(field.fees) <= 0) {
        return t('field.loanSummary', payment, field.termMonths, interest, total);
      }
      return t(
        'field.loanSummaryFees',
        payment,
        field.termMonths,
        formatAmount(borrowed),
        formatAmount(toAmount(field.amount)),
        interest,
        total,
      );
    },
    openNamed: (name) => t('field.open', name),
    closeNamed: (name) => t('field.close', name),
    /*
     * What a shut row says about itself: the facts its two visible boxes — a
     * name and an amount — cannot carry. Kind, direction, cadence, term, a rate
     * that has been set, and every month that has been set, including a named
     * target the field is waiting on.
     *
     * Every fragment is one the dictionary already has, joined the way the two
     * derived lines above already join theirs, with ' · '. Nothing here is a
     * new sentence for a translator to keep in step with a layout; it is the
     * same words the controls use, read out in the order the controls sit in.
     */
    saidFor: (field) => {
      const isLoan = field.kind === 'loan';
      const isAsset = field.kind === 'asset';
      const isOnce = field.kind === 'once';
      const isInvestment = field.kind === 'investment';
      const said = [t(`field.kind.${field.kind}`)];
      // The colour stripe repeats the direction rather than carrying it, so the
      // line has to say it on every kind that offers the select — and on the
      // two that hide it there is no direction to say.
      if (!isInvestment && !isAsset) said.push(t(field.direction === 'income' ? 'field.income' : 'field.expense'));
      if (!isLoan && !isAsset && !isOnce) said.push(t(`field.period.${field.periodMonths}`));
      if (isLoan) said.push(`${field.termMonths} ${t('field.termUnit')}`);
      // Only a rate that does something: zero and empty are the same to the
      // projection, and a row that said "0% a year" would be spending a third
      // of its line on nothing.
      const rate = annualPercent(field.annualRate, field.kind === 'loan' ? 0 : -100);
      if (!isOnce && Number.isFinite(rate) && rate !== 0) said.push(t('field.saidRate', formatRate(rate)));
      // A month waiting on a target says the target's name rather than the
      // month it resolves to: the name is what the reader chose, and the month
      // is already on the row's own curve above.
      const when = (month, at, word, short) => {
        const target = at && targets.find((one) => one.id === at);
        if (target) return `${t(short)} ${target.name}`;
        return month ? `${t(word)} ${month}` : '';
      };
      said.push(when(field.startMonth, field.startAt,
        isOnce ? 'field.onceWord' : 'field.fromWord',
        isOnce ? 'field.onceWordShort' : 'field.fromWordShort'));
      if (isInvestment) said.push(when(field.sellMonth, field.sellAt, 'field.sellWord', 'field.sellWordShort'));
      if (!isAsset && !isLoan && !isOnce) said.push(when(field.endMonth, field.endAt, 'field.toWord', 'field.toWordShort'));
      return said.filter(Boolean).join(' · ');
    },
    income: t('field.income'),
    expense: t('field.expense'),
    untitled: t('field.untitled'),
    add: t('field.add'),
    empty: t('fields.empty'),
    syncNamed: (name) => t('field.syncNamed', name),
    unsyncNamed: (name) => t('field.unsyncNamed', name),
    syncTitle: t('field.syncTitle'),
    syncedTitle: t('field.syncedTitle'),
    duplicateNamed: (name) => t('field.duplicateNamed', name),
    removeNamed: (name) => t('field.removeNamed', name),
    directionNamed: (name) => t('field.directionNamed', name),
    amountNamed: (what, name) => t('field.amountNamed', what, name),
  };
}
