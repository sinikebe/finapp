/**
 * projection.js — the money model.
 *
 * Pure functions, no DOM, no globals. Everything the app draws comes from here,
 * so this is the file to unit-test and the file to extend when new inputs
 * (savings, raises, extra expenses) arrive.
 */

/** Hard limits, so a pasted value or a crafted URL can't ask for a million points. */
export const MIN_MONTHS = 1;
export const MAX_MONTHS = 600;

/**
 * The largest monthly amount that keeps every cumulative total exact: at the
 * longest horizon, MAX_AMOUNT * MAX_MONTHS in cents (6e15) still sits inside
 * Number.MAX_SAFE_INTEGER (9.007e15), so no total ever drifts off whole cents.
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

/**
 * Project cumulative income, expenses and net over a horizon.
 *
 * The series start at month 0 with zero — nothing has been earned or paid yet —
 * so a horizon of N months yields N + 1 points.
 *
 * @param {{monthlyIncome?: number|string, monthlyRent?: number|string, months?: number|string}} input
 * @returns {{
 *   monthlyIncome: number, monthlyRent: number, monthlyNet: number, months: number,
 *   points: Array<{month: number, income: number, expenses: number, net: number}>,
 *   totals: {income: number, expenses: number, net: number},
 *   breakEvenMonth: number|null
 * }}
 */
export function project(input = {}) {
  const monthlyIncome = toAmount(input.monthlyIncome);
  const monthlyRent = toAmount(input.monthlyRent);
  const months = toMonths(input.months);
  const monthlyNet = roundMoney(monthlyIncome - monthlyRent);

  const points = [];
  for (let month = 0; month <= months; month += 1) {
    points.push({
      month,
      income: roundMoney(monthlyIncome * month),
      expenses: roundMoney(monthlyRent * month),
      net: roundMoney(monthlyNet * month),
    });
  }

  const last = points[points.length - 1];
  return {
    monthlyIncome,
    monthlyRent,
    monthlyNet,
    months,
    points,
    totals: { income: last.income, expenses: last.expenses, net: last.net },
    breakEvenMonth: monthlyNet > 0 ? 1 : null,
  };
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
