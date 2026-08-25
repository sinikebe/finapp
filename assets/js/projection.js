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
 * The largest monthly flow, per direction. It caps single fields and their sum
 * alike — twenty fields can't add up to something the arithmetic can no longer
 * represent. Money is held in units, not integer cents, so the cap bounds what
 * is representable rather than what is exact: below 2**45 (~3.5e13) a double's
 * step is finer than half a cent, so every total there is faithful, and above
 * it rounding has nowhere exact to land. A worst-case run — MAX_MONTHS of
 * MAX_AMOUNT, 6e13 — accumulates about two units of drift. Nothing a person
 * types comes near that; the cap is there to bound the arithmetic, not to
 * promise exactness at its own ceiling.
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
 * A yearly percentage into the fraction one month earns — or loses.
 *
 * Separate from `monthlyRate` because the two cannot share a floor: a return
 * can be negative, and a pessimistic run that bottomed out at "flat" would
 * understate exactly the case the reader wanted to see. A loan's interest is
 * in a contract rather than in the market, so loans keep `monthlyRate`.
 */
export function monthlyGrowth(annualRate) {
  const percent = Number.parseFloat(annualRate);
  if (!Number.isFinite(percent)) return 0;
  return Math.max(-100, Math.min(percent, 1000)) / 100 / 12;
}

/**
 * The same fields with every *return* moved by `points` percentage points —
 * the pessimistic run, or the hopeful one. Loan interest is deliberately left
 * where it is: what a loan costs was agreed, not guessed.
 */
export function shiftReturns(fields, points) {
  const shift = Number.parseFloat(points);
  if (!Number.isFinite(shift) || shift === 0) return fields;
  return fields.map((field) => {
    if (field.kind !== 'investment' && field.kind !== 'asset') return field;
    const rate = Number.parseFloat(field.annualRate);
    if (!Number.isFinite(rate)) return field;
    return { ...field, annualRate: String(rate + shift) };
  });
}

/**
 * What a loan actually lends: what you need, plus the fees the lender adds to
 * it. **This is the seam for a loan's principal** — the amount on the field is
 * what the reader wants in hand, and everything that amortises, is owed, or is
 * repaid works from what the bank hands over instead.
 *
 * Fees default to none, so every loan written before they existed borrows
 * exactly its amount and nothing moves under anyone.
 */
export function borrowedOf(field) {
  return roundMoney(Math.min(toAmount(field.amount) + toAmount(field.fees), MAX_AMOUNT));
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

/**
 * Every payment a loan asks for, added up. The figure that settles what a loan
 * costs: the amount was what you needed, and this is what leaves your account
 * to get it.
 */
export function loanTotal(field) {
  const term = Math.max(1, Math.trunc(Number(field.termMonths) || 0));
  return roundMoney(loanPayment(borrowedOf(field), field.annualRate, term) * term);
}

/** What a loan costs beyond what was borrowed — the fees are not interest. */
export function loanInterest(field) {
  const term = Math.max(1, Math.trunc(Number(field.termMonths) || 0));
  const borrowed = borrowedOf(field);
  return roundMoney(loanPayment(borrowed, field.annualRate, term) * term - borrowed);
}

/**
 * What a yearly percentage has done to an amount after `years` whole years.
 *
 * Whole years, and a step rather than a slope: a raise arrives on an
 * anniversary, not a little every month. Compounding it monthly would be
 * arithmetically tidier and would describe nobody's pay.
 */
export function grownBy(amount, annualRate, years) {
  const base = toAmount(amount);
  const percent = Number.parseFloat(annualRate);
  if (!base || !Number.isFinite(percent) || percent === 0 || years <= 0) return base;
  const rate = Math.max(-100, Math.min(percent, 1000)) / 100;
  return roundMoney(Math.min(base * (1 + rate) ** Math.trunc(years), MAX_AMOUNT));
}

/**
 * How many whole years a field has been running by a given month.
 *
 * Counted from the first month it could land rather than from month 0, because
 * a salary starting today pays twelve times before its first anniversary — so
 * the raise belongs in month 13, not month 12. Put the other way round: the
 * first time an amount lands it lands at what you typed, and a year later it
 * has climbed once.
 */
export function yearsRunning(field, month) {
  return Math.floor((month - Math.max(1, startOf(field))) / 12);
}

/** The first month a field can land. 0 means "from the beginning". */
export function startOf(field) {
  const start = Math.trunc(Number(field.startMonth) || 0);
  return start > 0 ? start : 0;
}

/**
 * A loan's first payment. With no start of its own that is month 1, which is
 * what every loan written before windows existed means.
 */
export function firstPaymentOf(field) {
  return Math.max(1, startOf(field));
}

/**
 * The month a loan's money actually arrives: the instant before the first
 * payment. It matters because that is when the debt appears — a mortgage you
 * plan to take next year is not a debt you carry today.
 */
export function drawMonthOf(field) {
  return firstPaymentOf(field) - 1;
}

/**
 * What is still owed on a loan after `month` payments — the principal that has
 * not been repaid yet. Walked a month at a time rather than closed-form so it
 * rounds exactly the way the projection does, and so a payment that does not
 * cover the interest still behaves (the balance simply stops falling).
 */
export function outstandingOf(field, month) {
  const term = Math.max(1, Math.trunc(Number(field.termMonths) || 0));
  const principal = borrowedOf(field);
  if (!principal) return 0;

  const drawn = drawMonthOf(field);
  // Not borrowed yet, so nothing is owed yet.
  if (month < drawn) return 0;
  const paid = Math.trunc(month) - drawn;
  // The term is up: amortisation has cleared it by construction, and saying so
  // outright keeps a rounding residue from lingering as a few cents of debt.
  if (paid >= term) return 0;

  const rate = monthlyRate(field.annualRate);
  const payment = loanPayment(principal, field.annualRate, term);
  let balance = principal;
  for (let m = 1; m <= Math.max(0, paid); m += 1) {
    balance = roundMoney(Math.max(0, balance * (1 + rate) - payment));
  }
  return balance;
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
  // An asset is a thing you own, not a flow. It never lands, so it moves no
  // cash in any month; what it is worth is a balance, tracked in `project`.
  if (field.kind === 'asset') return 0;

  const start = startOf(field);
  // Nothing lands before a field begins.
  if (month < start) return 0;

  // A one-off is its own window: one month, once, done.
  if (field.kind === 'once') {
    return month === firstPaymentOf(field) ? toAmount(field.amount) : 0;
  }

  if (field.kind === 'loan') {
    // Repayments are monthly and stop with the term; nothing lands after it.
    const term = Math.max(1, Math.trunc(Number(field.termMonths) || 0));
    const first = firstPaymentOf(field);
    return month >= first && month < first + term
      ? loanPayment(borrowedOf(field), field.annualRate, term)
      : 0;
  }

  // ...and nothing lands after it ends, where 0 means it never does.
  const end = Math.trunc(Number(field.endMonth) || 0);
  if (end && month > end) return 0;

  // Counted from the start, so a yearly amount beginning in month 3 lands in
  // months 3, 15, 27 rather than on a calendar nobody set. With no start of
  // its own the count runs from month 0, which is what every field written
  // before windows existed already does.
  const period = field.periodMonths || DEFAULT_PERIOD;
  if ((month - start) % period !== 0) return 0;

  // A plain amount can climb: a salary that rises a few percent a year, a rent
  // indexed to prices. The rate slot every field already carries finally means
  // something here — but only here. On an investment the same slot is the
  // *return*, and letting that grow the contribution as well would pay in more
  // every year because the market did well, which is not what anybody meant.
  if (field.kind !== 'plain') return toAmount(field.amount);
  return grownBy(field.amount, field.annualRate, yearsRunning(field, month));
}

/** What one field moves across a whole horizon — its share of the flow. */
export function fieldTotalOf(field, months) {
  let total = 0;
  for (let month = 1; month <= months; month += 1) {
    total = roundMoney(total + contributionOf(field, month));
  }
  return total;
}

/**
 * Split a total across weights so the parts sum to the whole *exactly*.
 *
 * Proportions alone do not: ten independently rounded shares can miss their own
 * total by a few cents, and a diagram whose parts disagree with the tile above
 * it is the kind of thing this model refuses to print. So the parts are derived
 * from the total rather than beside it — floor everything to the cent, then hand
 * the leftover cents to the largest remainders, which is the standard
 * largest-remainder apportionment.
 *
 * It also makes the split inherit whatever the projection already did to the
 * total. Restating in today's money divides every figure at a given month by one
 * factor, so it leaves proportions untouched — which means these weights stay
 * right and the shares come out already restated.
 */
export function shareOut(total, weights) {
  const cents = Math.round(roundMoney(total) * 100);
  const sum = weights.reduce((running, weight) => running + weight, 0);
  if (!weights.length || sum <= 0 || cents <= 0) return weights.map(() => 0);

  const exact = weights.map((weight) => (weight / sum) * cents);
  const parts = exact.map((value) => Math.floor(value));
  let left = cents - parts.reduce((running, part) => running + part, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let k = 0; left > 0 && k < byRemainder.length; k += 1, left -= 1) {
    parts[byRemainder[k].index] += 1;
  }
  return parts.map((part) => part / 100);
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
 * The flows start at month 0 with zero — nothing has been earned or paid yet —
 * so a horizon of N months yields N + 1 points. The balances do not: you
 * already own what you own and owe what you owe, so month 0 carries them.
 *
 * @param {{fields?: Array<object>, months?: number|string}} input
 * @returns {{
 *   fields: Array<object>, months: number,
 *   monthlyIncome: number, monthlyExpenses: number, monthlyNet: number,
 *   points: Array<{month: number, income: number, expenses: number, net: number,
 *                  invested: number, contributed: number, profit: number,
 *                  owned: number, debt: number, worth: number}>,
 *   totals: {income: number, expenses: number, net: number, invested: number,
 *            contributed: number, profit: number,
 *            owned: number, debt: number, worth: number}
 * }}
 */
export function project(input = {}) {
  const fields = normalizeFields(input.fields);
  const months = toMonths(input.months);
  // No rate unless one is asked for: a model that taxed by default would put a
  // number on screen nobody chose. The app supplies the reader's rate.
  const taxRate = input.taxRate ?? 0;

  // Money put into an investment leaves the account like any other outgoing, so
  // it is already in `expenses`. What it is *worth* is a different quantity: a
  // balance that grows, tracked per field because each carries its own rate.
  const investments = fields.filter((field) => field.kind === 'investment');
  const balances = new Map(investments.map((field) => [field.id, 0]));
  // What has actually been paid in, kept apart from what it has become: the
  // difference between the two is the whole point of holding an investment.
  let contributed = 0;

  // The balance sheet. Unlike the flows, these do not start at nothing: you
  // already own what you own and already owe what you owe, so month 0 carries
  // their present values. A loan you are repaying is a debt; a loan pointing
  // the other way is money owed *to* you, which is something you own.
  const assets = fields.filter((field) => field.kind === 'asset');
  const loans = fields.filter((field) => field.kind === 'loan');
  const values = new Map(assets.map((field) => [field.id, toAmount(field.amount)]));
  // A loan not yet drawn is not yet a debt: only one taken from the outset is
  // owed at month 0.
  const owing = new Map(loans.map(
    (field) => [field.id, drawMonthOf(field) === 0 ? borrowedOf(field) : 0],
  ));
  const sumOf = (map, list) => roundMoney(
    list.reduce((total, field) => total + (map.get(field.id) || 0), 0),
  );
  const lent = loans.filter((field) => field.direction === 'income');
  const borrowed = loans.filter((field) => field.direction === 'expense');
  const ownedNow = () => roundMoney(sumOf(values, assets) + sumOf(owing, lent));
  const debtNow = () => sumOf(owing, borrowed);

  // Accumulated month by month rather than multiplied, so a field whose
  // contribution varies over time needs no change here — only `contributionOf`.
  const points = [{
    month: 0,
    income: 0,
    expenses: 0,
    net: 0,
    invested: 0,
    contributed: 0,
    profit: 0,
    owned: ownedNow(),
    debt: debtNow(),
    worth: roundMoney(ownedNow() - debtNow()),
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
      const paid = contributionOf(field, month);
      const grown = balances.get(field.id) * (1 + monthlyGrowth(field.annualRate));
      const balance = roundMoney(grown + paid);
      balances.set(field.id, balance);
      invested = roundMoney(invested + balance);
      contributed = roundMoney(contributed + paid);
    }

    for (const field of assets) {
      // An asset simply appreciates — or does not, at the default of no rate.
      values.set(field.id, roundMoney(values.get(field.id) * (1 + monthlyGrowth(field.annualRate))));
    }
    for (const field of loans) {
      const term = Math.max(1, Math.trunc(Number(field.termMonths) || 0));
      const drawn = drawMonthOf(field);
      if (month < drawn) { owing.set(field.id, 0); continue; }
      // The month the money arrives: the debt appears, and nothing is repaid
      // yet — the first payment is the month after.
      if (month === drawn) { owing.set(field.id, borrowedOf(field)); continue; }
      if (month - drawn > term) { owing.set(field.id, 0); continue; }
      // A month's interest, then the payment against it: what is left is the
      // principal still outstanding. Floored at zero so the last payment's
      // rounding cannot leave a debt behind.
      const rate = monthlyRate(field.annualRate);
      const payment = loanPayment(borrowedOf(field), field.annualRate, term);
      owing.set(field.id, roundMoney(Math.max(0, owing.get(field.id) * (1 + rate) - payment)));
    }

    // What the reader is actually worth: the cash kept, plus what the
    // investments are worth, plus what they own, less what they still owe.
    // Money put into an investment has already left `net` as an outgoing, so
    // adding the balance back is a sum rather than double-counting — and a
    // repayment that clears principal moves cash and debt by the same amount,
    // so only the interest in it makes anyone poorer.
    const net = roundMoney(income - expenses);
    const owned = ownedNow();
    const debt = debtNow();
    points.push({
      month,
      income,
      expenses,
      net,
      invested,
      contributed,
      profit: afterTax(invested - contributed, taxRate),
      owned,
      debt,
      worth: roundMoney(net + invested + owned - debt),
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
    taxRate,
    averages,
    points,
    totals: {
      income: last.income,
      expenses: last.expenses,
      net: last.net,
      invested: last.invested,
      contributed: last.contributed,
      profit: last.profit,
      owned: last.owned,
      debt: last.debt,
      worth: last.worth,
    },
  };
}

/**
 * What is left of a gain once the taxman has been. A loss is returned as it
 * stands: it is not taxed, and it is emphatically not a credit — an app that
 * quietly handed back 30% of a bad decade would be lying in the friendly
 * direction, which is the worse one.
 */
export function afterTax(gain, taxRate) {
  if (!(gain > 0)) return roundMoney(gain);
  const percent = Number.parseFloat(taxRate);
  const rate = Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 100) / 100 : 0;
  return roundMoney(gain * (1 - rate));
}

/**
 * Restate a projection in today's money: what each figure would actually buy
 * now, rather than what it will say on a statement years from here.
 *
 * Every figure at month `m` is divided by the same deflator, `(1 + i)^m`. That
 * is the honest reading for a balance — this pile, then, buys that much, now —
 * and because it is one factor per month it leaves every identity in the model
 * standing: net is still income less expenses, worth is still the balance
 * sheet, and the comparison's gaps still add up. Deflating each flow at the
 * month it landed instead would break the second of those, which is the one
 * the reader is most likely to check by hand.
 *
 * @param {object} projection a projection in the money of its own time
 * @param {string|number} annualRate inflation a year, as a percentage
 */
/**
 * The series defined in terms of the others, in dependency order.
 *
 * Deflating every figure independently rounds each to the cent, and four
 * rounded parts need not add up to the rounded whole — a total could sit a cent
 * away from its own components. So these are recomputed from the restated parts
 * rather than restated themselves, and the arithmetic on screen stays something
 * the reader can check by hand.
 */
const DERIVED = [
  ['net', (p) => p.income - p.expenses],
  ['worth', (p) => p.net + p.invested + p.owned - p.debt],
  // Restated from the restated parts, and at the rate the projection was run
  // with, so the profit on screen is always the gain on screen less its tax.
  ['profit', (p, projection) => afterTax(p.invested - p.contributed, projection.taxRate)],
];

export function inTodaysMoney(projection, annualRate) {
  const rate = monthlyRate(annualRate);
  if (!rate) return projection;

  const deflate = (value, month) => roundMoney(value / (1 + rate) ** month);
  const points = projection.points.map((point) => {
    const restated = { month: point.month };
    for (const [key, value] of Object.entries(point)) {
      if (key !== 'month') restated[key] = deflate(value, point.month);
    }
    for (const [key, of] of DERIVED) {
      if (key in restated) restated[key] = roundMoney(of(restated, projection));
    }
    return restated;
  });

  const last = points[points.length - 1];
  return {
    ...projection,
    points,
    // Every series the projection carries, without naming any of them: a new
    // one is restated here the day it is added, with no edit.
    totals: Object.fromEntries(Object.keys(projection.totals).map((key) => [key, last[key]])),
    averages: Object.fromEntries(Object.entries(projection.averages)
      .map(([key, value]) => [key, deflate(value, projection.months)])),
  };
}

/**
 * True once any field carries an amount — before that, there is nothing to
 * draw. Read from the fields rather than from the totals: a yearly amount over
 * a six-month horizon lands nowhere inside it, and the reader who just typed it
 * should still see their charts rather than "add an amount".
 */
export function hasAmounts(projection) {
  // A loan counts by what it borrows, so a fee-only loan does not leave the
  // debt tile contradicting a chart that says nothing has been entered.
  return projection.fields.some((field) => (
    field.kind === 'loan' ? borrowedOf(field) > 0 : toAmount(field.amount) > 0
  ));
}

/** True when any field builds a balance worth charting on its own. */
export function hasInvestments(projection) {
  return projection.fields.some((field) => field.kind === 'investment' && toAmount(field.amount) > 0);
}

/** True when something is still owed — a loan being repaid. */
export function hasDebt(projection) {
  return projection.fields.some(
    (field) => field.kind === 'loan' && field.direction === 'expense' && borrowedOf(field) > 0,
  );
}

/** True when something is owned outright, or owed to the reader. */
export function hasOwned(projection) {
  return projection.fields.some((field) => toAmount(field.amount) > 0 && (
    field.kind === 'asset' || (field.kind === 'loan' && field.direction === 'income')
  ));
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
