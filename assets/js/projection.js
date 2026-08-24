/**
 * projection.js — the money model.
 *
 * Pure functions, no DOM, no globals. It takes the reader's fields and turns
 * them into the cumulative series the app draws, so this is the file to test
 * and the file to extend when fields learn a new trick (a start month, a yearly
 * cadence, a growth rate): the loop below is the only place that has to change.
 */

import { normalizeFields, DEFAULT_PERIOD } from './fields.js';

/** Hard limits, so a pasted value or a hand-edited store can't ask for a million points. */
export const MIN_MONTHS = 1;
export const MAX_MONTHS = 600;

/**
 * The largest monthly flow, per direction, that keeps every cumulative total
 * exact: at the longest horizon, MAX_AMOUNT * MAX_MONTHS in cents (6e15) still
 * sits inside Number.MAX_SAFE_INTEGER (9.007e15), so no total ever drifts off
 * whole cents. It caps single fields and their sum alike — twenty fields can't
 * add up to something the arithmetic can no longer represent.
 */
export const MAX_AMOUNT = 1e11;

/** Money is kept to whole cents; float drift never reaches the screen. */
export function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Coerce anything (string from an <input>, null, NaN) to a non-negative amount. */
export function toAmount(value) {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return roundMoney(Math.min(n, MAX_AMOUNT));
}

/** Coerce anything to a whole number of months inside the supported range. */
export function toMonths(value) {
  const n = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return MIN_MONTHS;
  return Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, Math.trunc(n)));
}

/** A yearly percentage, as typed, into the fraction one month earns. */
export function monthlyRate(annualRate) {
  const percent = Number.parseFloat(annualRate);
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  // A century of interest a year is already absurd; past that the arithmetic is
  // the least of anyone's problems.
  return Math.min(percent, 1000) / 100 / 12;
}

/**
 * The level repayment that clears `principal` over `termMonths`, interest
 * included — the standard amortisation formula. At 0% it is simply the
 * principal split evenly, which is also what the formula tends to.
 */
export function loanPayment(principal, annualRate, termMonths) {
  const amount = toAmount(principal);
  const term = Math.max(1, Math.trunc(Number(termMonths) || 0));
  if (!amount) return 0;

  const rate = monthlyRate(annualRate);
  if (!rate) return roundMoney(amount / term);
  return roundMoney((amount * rate) / (1 - (1 + rate) ** -term));
}

/** What a loan costs beyond what was borrowed. */
export function loanInterest(field) {
  const term = Math.max(1, Math.trunc(Number(field.termMonths) || 0));
  return roundMoney(loanPayment(field.amount, field.annualRate, term) * term - toAmount(field.amount));
}

/**
 * What one field moves in a given month. **This is the seam.** Every attribute
 * a field grows — a start month, an end month, a growth rate — decides its
 * meaning here, and nothing else in the app has to change.
 *
 * A field lands at the end of each of its periods: a yearly amount at months
 * 12, 24, 36, a quarterly one at 3, 6, 9. So the projection shows the money
 * moving when it actually moves, and a lumpy year reads as a staircase rather
 * than a smooth line that never matches anyone's bank balance.
 *
 * @param {object} field
 * @param {number} month 1-based: month 1 is the first month of the projection
 */
export function contributionOf(field, month) {
  if (field.kind === 'loan') {
    // Repayments are monthly and stop with the term; nothing lands after it.
    const term = Math.max(1, Math.trunc(Number(field.termMonths) || 0));
    return month <= term ? loanPayment(field.amount, field.annualRate, term) : 0;
  }

  const period = field.periodMonths || DEFAULT_PERIOD;
  return month % period === 0 ? toAmount(field.amount) : 0;
}

/** What one direction moves in a given month, across every field. */
export function flowIn(fields, direction, month) {
  const total = fields.reduce(
    (sum, field) => (field.direction === direction ? sum + contributionOf(field, month) : sum),
    0,
  );
  // Capped per month, so a hundred fields can't add up to something the
  // arithmetic can no longer represent in whole cents.
  return roundMoney(Math.min(total, MAX_AMOUNT));
}

/**
 * Project cumulative income, expenses and net over a horizon.
 *
 * The series start at month 0 with zero — nothing has been earned or paid yet —
 * so a horizon of N months yields N + 1 points.
 *
 * @param {{fields?: Array<object>, months?: number|string}} input
 * @returns {{
 *   fields: Array<object>, months: number,
 *   monthlyIncome: number, monthlyExpenses: number, monthlyNet: number,
 *   points: Array<{month: number, income: number, expenses: number, net: number,
 *                  invested: number, worth: number}>,
 *   totals: {income: number, expenses: number, net: number,
 *            invested: number, worth: number}
 * }}
 */
export function project(input = {}) {
  const fields = normalizeFields(input.fields);
  const months = toMonths(input.months);

  // Money put into an investment leaves the account like any other outgoing, so
  // it is already in `expenses`. What it is *worth* is a different quantity: a
  // balance that grows, tracked per field because each carries its own rate.
  const investments = fields.filter((field) => field.kind === 'investment');
  const balances = new Map(investments.map((field) => [field.id, 0]));

  // Accumulated month by month rather than multiplied, so a field whose
  // contribution varies over time needs no change here — only `contributionOf`.
  const points = [{
    month: 0, income: 0, expenses: 0, net: 0, invested: 0, worth: 0,
  }];
  let income = 0;
  let expenses = 0;
  for (let month = 1; month <= months; month += 1) {
    income = roundMoney(income + flowIn(fields, 'income', month));
    expenses = roundMoney(expenses + flowIn(fields, 'expense', month));

    let invested = 0;
    for (const field of investments) {
      // A month's growth, then the month's contribution: money invested today
      // has not had time to earn yet. Rounded to the cent each month, the way
      // a statement does, rather than carrying fractions of a cent forever.
      const grown = balances.get(field.id) * (1 + monthlyRate(field.annualRate));
      const balance = roundMoney(grown + contributionOf(field, month));
      balances.set(field.id, balance);
      invested = roundMoney(invested + balance);
    }

    // What the reader actually has: the cash they kept plus what the
    // investments are worth. Money put in has already left `net` as an
    // outgoing, so adding the balance back is a sum, not double-counting.
    const net = roundMoney(income - expenses);
    points.push({
      month, income, expenses, net, invested, worth: roundMoney(net + invested),
    });
  }

  const last = points[points.length - 1];
  // Per month across the whole horizon, not the first month's flow: with a
  // yearly bill in the list there is no single monthly figure, and an average
  // is the one that still answers "what does this cost me a month?".
  const averages = {
    income: roundMoney(last.income / months),
    expenses: roundMoney(last.expenses / months),
    net: roundMoney((last.income - last.expenses) / months),
  };

  return {
    fields,
    months,
    averages,
    points,
    totals: {
      income: last.income,
      expenses: last.expenses,
      net: last.net,
      invested: last.invested,
      worth: last.worth,
    },
  };
}

/**
 * True once any field carries an amount — before that, there is nothing to
 * draw. Read from the fields rather than from the totals: a yearly amount over
 * a six-month horizon lands nowhere inside it, and the reader who just typed it
 * should still see their charts rather than "add an amount".
 */
export function hasAmounts(projection) {
  return projection.fields.some((field) => toAmount(field.amount) > 0);
}

/** True when any field builds a balance worth charting on its own. */
export function hasInvestments(projection) {
  return projection.fields.some((field) => field.kind === 'investment' && toAmount(field.amount) > 0);
}

/** Extract one cumulative series from a projection. */
export function seriesOf(projection, key) {
  return projection.points.map((p) => ({ month: p.month, value: p[key] }));
}

/** Smallest and largest value across several series — the shared chart domain. */
export function extentOf(seriesList) {
  let min = 0;
  let max = 0;
  for (const series of seriesList) {
    for (const point of series) {
      if (point.value < min) min = point.value;
      if (point.value > max) max = point.value;
    }
  }
  return { min, max };
}
