/**
 * format.js — number formatting, bound to the chosen language's locale.
 *
 * Amounts carry no currency symbol: the app never asks which currency you use,
 * so it never claims to know. Call `setFormatLocale()` when the language
 * changes; the exported functions are stable references, so anything holding
 * one (a chart, say) picks up the new locale automatically.
 */

let current = { amount: null, whole: null, compact: null };

function plainFallback(value) {
  return String(Math.round(value * 100) / 100);
}

function compactFallback(value) {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${Math.round(value / 1e8) / 10}B`;
  if (abs >= 1e6) return `${Math.round(value / 1e5) / 10}M`;
  if (abs >= 1e3) return `${Math.round(value / 1e2) / 10}K`;
  return plainFallback(value);
}

function build(locale, options, fallback) {
  try {
    const formatter = new Intl.NumberFormat(locale, options);
    formatter.format(1234.5); // compact notation can fail late on old engines
    return (value) => formatter.format(value);
  } catch {
    return fallback;
  }
}

/**
 * Rebuild the formatters for a locale tag. An invalid tag (some environments
 * report `en-US@posix`) falls back to the runtime default rather than dropping
 * grouping from every number in the app.
 * @param {string|undefined} locale
 */
export function setFormatLocale(locale) {
  let tag = locale;
  try {
    if (tag) Intl.getCanonicalLocales(tag);
  } catch {
    tag = undefined;
  }
  current = {
    amount: build(tag, { maximumFractionDigits: 2, minimumFractionDigits: 0 }, plainFallback),
    whole: build(tag, { maximumFractionDigits: 0 }, plainFallback),
    compact: build(tag, { notation: 'compact', maximumFractionDigits: 1 }, compactFallback),
  };
}

setFormatLocale(undefined);

/** Full precision-to-cents amount: 72,012 · 1,234.5 · -480 */
export function formatAmount(value) {
  return current.amount(value);
}

/** Whole amounts for headline figures: 72,012 */
export function formatWhole(value) {
  return current.whole(value);
}

/** Axis-tick scale: 0 · 12K · 1.2M — short enough to sit in a 46px gutter. */
export function formatCompact(value) {
  return current.compact(value);
}

/**
 * "2 yr 6 mo" / "2 ans 6 mois" — a horizon in human units.
 * @param {number} months
 * @param {(key: string, ...params: unknown[]) => string} t
 */
export function formatHorizon(months, t) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(t('horizon.years', years));
  if (rest || !years) parts.push(t('horizon.months', rest));
  return parts.join(' ');
}

/**
 * "Start" / "Month 24" — the x position, spelled out.
 * @param {number} month
 * @param {(key: string, ...params: unknown[]) => string} t
 */
export function formatMonth(month, t) {
  return month === 0 ? t('month.start') : t('month.nth', formatWhole(month));
}
