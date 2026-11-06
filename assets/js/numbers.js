/** Numeric input and bounds shared by models and views. No DOM or model imports. */
export const MIN_MONTHS = 1;
export const MAX_MONTHS = 600;
/** Capping each monthly flow keeps 600 months of cent totals within 2**53. */
export const MAX_AMOUNT = 1e11;
export const MAX_NUMBER_TEXT = 128;

export function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Keep typed figures bounded without converting an unfinished edit to zero. */
export function numberText(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return '';
  const text = String(value);
  return text.length <= MAX_NUMBER_TEXT ? text : '';
}

/**
 * Amounts accept English grouping and French decimal commas. Rates never use
 * grouping: 3,125% is 3.125%, regardless of the number of fractional digits.
 * Reject a malformed whole string instead of silently reading its prefix.
 */
export function toNumber(value, { grouping = true } = {}) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.length > MAX_NUMBER_TEXT) return NaN;
  let bare = value.replace(/\s/g, '');
  if (!bare) return NaN;
  if (bare.includes(',')) {
    if (grouping && /^[+-]?\d{1,3}(,\d{3})+(\.\d*)?([eE][+-]?\d+)?$/.test(bare)) {
      bare = bare.replace(/,/g, '');
    } else if (!bare.includes('.') && (bare.match(/,/g) || []).length === 1) {
      bare = bare.replace(',', '.');
    } else return NaN;
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(bare)) return NaN;
  return Number(bare);
}

export const toRateNumber = (value) => toNumber(value, { grouping: false });

/** The annual percentage the model actually uses, before monthly conversion. */
export function annualPercent(value, min = -100, max = 1000) {
  const rate = toRateNumber(value);
  return Number.isFinite(rate) ? Math.min(max, Math.max(min, rate)) : 0;
}

export function toAmount(value) {
  const n = toNumber(value);
  return Number.isFinite(n) && n > 0 ? roundMoney(Math.min(n, MAX_AMOUNT)) : 0;
}

export function toMonths(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, Math.trunc(n))) : MIN_MONTHS;
}
