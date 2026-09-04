/**
 * projection.js — the money model.
 *
 * Pure functions, no DOM, no globals. It takes the reader's fields and turns
 * them into the cumulative series the app draws, so this is the file to test
 * and the file to extend when fields learn a new trick (a start month, a yearly
 * cadence, a growth rate): the loop below is the only place that has to change.
 */

import { normalizeFields, raiseAmount, DEFAULT_PERIOD } from './fields.js';

/** Hard limits, so a pasted value or a hand-edited store can't ask for a million points. */
export const MIN_MONTHS = 1;
export const MAX_MONTHS = 600;

/**
 * The largest monthly flow, per direction. It caps single fields and their sum
 * alike — twenty fields can't add up to something the arithmetic can no longer
 * represent. Money is held in units, not integer cents, so `roundMoney` is
 * exact only while a total's cents are still a whole number a double can hold,
 * and this cap is what keeps them there: the worst run, MAX_MONTHS of
 * MAX_AMOUNT, is 6e13, whose 6e15 cents sit well inside 2**53. So every total
 * the flows produce is exact, that run included.
 *
 * What the cap does not bound is a compounded balance — an investment is
 * multiplied rather than added — so an implausible rate over fifty years can
 * carry one past ~9e13, where a double's step is wider than a cent. Nothing a
 * person types comes near either bound.
 */
export const MAX_AMOUNT = 1e11;

/** Money is kept to whole cents; float drift never reaches the screen. */
export function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Read a figure however it was written down.
 *
 * A number box parses by the *browser's* locale while the app prints by the
 * language the *reader* picked, so the two disagree the moment they differ: the
 * app shows a French reader 674 379,24 and then drops the comma out of what
 * they type back, storing twelve-fifty as 1250 — a hundredfold error, silently,
 * in the one place an app like this must never make one. So the boxes take text
 * and the separators are sorted out here, once, for every figure the app reads.
 *
 * Spaces of every width are grouping and go. A comma is a decimal point except
 * where it is plainly grouping: English groups in threes, and no fraction of
 * money or of a percentage is written to exactly three places. That leaves
 * "1,234" as one thousand and "12,50" as twelve and a half, which is what each
 * of them was written to mean.
 */
export function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const bare = value.replace(/\s/g, '');
  // A decimal point settles it: every comma left is grouping.
  if (bare.includes('.')) return Number.parseFloat(bare.replace(/,/g, ''));
  const parts = bare.split(',');
  if (parts.length === 1) return Number.parseFloat(bare);
  const last = parts[parts.length - 1];
  if (parts.length > 2 || last.length === 3) return Number.parseFloat(parts.join(''));
  return Number.parseFloat(`${parts.slice(0, -1).join('')}.${last}`);
}

/** Coerce anything (string from an <input>, null, NaN) to a non-negative amount. */
export function toAmount(value) {
  const n = toNumber(value);
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
  const percent = toNumber(annualRate);
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
  const percent = toNumber(annualRate);
  if (!Number.isFinite(percent)) return 0;
  return Math.max(-100, Math.min(percent, 1000)) / 100 / 12;
}

/**
 * The same fields with every *return* moved by `points` percentage points —
 * the pessimistic run, or the hopeful one. Loan interest is deliberately left
 * where it is: what a loan costs was agreed, not guessed.
 */
export function shiftReturns(fields, points) {
  const shift = toNumber(points);
  if (!Number.isFinite(shift) || shift === 0) return fields;
  return fields.map((field) => {
    if (field.kind !== 'investment' && field.kind !== 'asset') return field;
    // An unreadable rate is the nought the rest of the model already reads it
    // as — `monthlyGrowth('')` is 0 — and blank is what every investment starts
    // out with. Skipping it banded the one field the reader had just added
    // differently from an identical one where they had typed the nought in.
    const rate = toNumber(field.annualRate);
    const base = Number.isFinite(rate) ? rate : 0;
    return { ...field, annualRate: String(base + shift) };
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
  // Floored, because a payment is rounded to the cent in both directions: at
  // 0% over three months, 1,000 repays 333.33 a month and the residue is a
  // penny *short*, which the row then advertised as "-0.01 of interest" — over
  // a diagram reporting 0 for the same quantity, since `loanPartsOf` floors its
  // own. A loan that repays a penny less than it lent has cost nothing.
  return roundMoney(Math.max(0, loanPayment(borrowed, field.annualRate, term) * term - borrowed));
}

/**
 * What a loan's repayments *were made of*, over the months so far.
 *
 * A repayment is not one thing: part of it clears the balance and part of it is
 * the price of having borrowed. Drawn as a single ribbon a mortgage says only
 * "this much left", which is the one question the flow diagram exists to go
 * past.
 *
 * Both halves are read from figures the app already stands behind rather than
 * derived afresh: the total from `fieldTotalOf`, which is what the diagram
 * draws, and what has come off the balance from `outstandingOf`, which is what
 * the debt tile shows. The interest is then whatever is left, so the parts sum
 * to the whole by construction rather than by luck. The fees are lent inside
 * the principal, so they come out of it in proportion — apportioned, so those
 * two add up exactly too.
 *
 * @returns {{principal: number, fees: number, interest: number, total: number}}
 */
export function loanPartsOf(field, months) {
  const total = fieldTotalOf(field, months);
  if (field.kind !== 'loan' || total <= 0) {
    return { principal: total, fees: 0, interest: 0, total };
  }

  // What has come off the balance, read from the same walk the debt tile does,
  // so the diagram, the row and the tile cannot tell three different stories.
  // Accumulating each month's interest instead drifts: rounding twelve times a
  // year for twenty-five years put it seventeen cents off `loanInterest`.
  // Clamped both ways because a payment too small to cover its own interest
  // makes the balance grow, and neither part may go negative or exceed what
  // actually moved.
  const cleared = roundMoney(borrowedOf(field) - outstandingOf(field, months));
  const repaid = Math.min(Math.max(0, cleared), total);
  const interest = roundMoney(total - repaid);
  const [principal, fees] = shareOut(repaid, [toAmount(field.amount), toAmount(field.fees)]);
  return { principal, fees, interest, total };
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
  const percent = toNumber(annualRate);
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
 * The last month at or before `months` on which a field actually moves money,
 * or 0 if it never does inside the horizon.
 *
 * Asked of `contributionOf` rather than worked out again here, so the answer
 * cannot drift from the one the projection uses. The walk starts at whichever
 * of the horizon, the end and the sale comes first, so for anything periodic
 * it finds its month within one period.
 */
export function lastLandingOf(field, months) {
  const end = Math.trunc(Number(field.endMonth) || 0);
  const sold = Math.trunc(Number(field.sellMonth) || 0);
  const horizon = toMonths(months);
  const from = Math.min(horizon, end || horizon, sold || horizon);
  for (let month = from; month >= 1; month -= 1) {
    if (contributionOf(field, month) > 0) return month;
  }
  return 0;
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

  // Nor after a holding has been cashed in: you cannot pay into what you no
  // longer hold. The month of the sale still takes its contribution, so the
  // balance that is sold is the one the statement would show.
  const sold = Math.trunc(Number(field.sellMonth) || 0);
  if (sold && month > sold) return 0;

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
 * `proceeds` is money that arrived by cashing a holding in rather than by a
 * field earning it. It is already inside `income`, and carried separately so
 * that `profit` can tell a realised gain from a paper one — and so the flow
 * diagram can name where that part of the income came from.
 *
 * @param {{fields?: Array<object>, months?: number|string, taxRate?: number}} input
 * @returns {{
 *   fields: Array<object>, months: number, taxRate: number,
 *   averages: {income: number, expenses: number, net: number},
 *   points: Array<{month: number, income: number, expenses: number, net: number,
 *                  invested: number, contributed: number, proceeds: number,
 *                  profit: number,
 *                  owned: number, debt: number, worth: number}>,
 *   totals: {income: number, expenses: number, net: number, invested: number,
 *            contributed: number, proceeds: number, profit: number,
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
  // Worth nothing until the month you acquire it — the same rule a loan
  // follows for the month its money arrives.
  const values = new Map(assets.map(
    (field) => [field.id, startOf(field) === 0 ? toAmount(field.amount) : 0],
  ));
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
    proceeds: 0,
    profit: 0,
    owned: ownedNow(),
    debt: debtNow(),
    worth: roundMoney(ownedNow() - debtNow()),
  }];
  let income = 0;
  let expenses = 0;
  /** What cashing investments in has brought in, cumulative. */
  let proceeds = 0;
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

    // Cashing in is the one moment an investment moves money the other way:
    // the balance stops being a holding and becomes money in the account. It
    // joins income because that is what it is — money arriving — and the
    // contributions that built it left as outgoings, so over the whole life
    // what remains in `net` is exactly the gain. `worth` does not move on the
    // day of a sale, which is the test that it is a conversion and not a
    // windfall.
    for (const field of investments) {
      const sold = Math.trunc(Number(field.sellMonth) || 0);
      if (sold !== month) continue;
      const balance = balances.get(field.id) || 0;
      if (!balance) continue;
      income = roundMoney(income + balance);
      balances.set(field.id, 0);
      invested = roundMoney(invested - balance);
      // Remembered because `contributed` still counts what was paid into it:
      // without the proceeds beside them, selling a fund at a gain would read
      // as having lost every penny ever paid in.
      proceeds = roundMoney(proceeds + balance);
    }

    for (const field of assets) {
      const from = startOf(field);
      // Not yours yet, so worth nothing to you.
      if (month < from) { values.set(field.id, 0); continue; }
      // The month it becomes yours it is worth what it cost; it appreciates
      // from there, not before.
      if (month === from) { values.set(field.id, toAmount(field.amount)); continue; }
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
      // `>=`, not `>`: once the term's payments are made the loan is cleared by
      // construction, and saying so outright is what keeps the last month's
      // rounding from lingering as a few cents of debt — the same rule, and the
      // same reason, as `outstandingOf`. The two must agree on every month.
      if (month - drawn >= term) { owing.set(field.id, 0); continue; }
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
      proceeds,
      // What the investments have made: what they are worth now, plus whatever
      // selling them brought in, less everything paid into them. A holding sold
      // at a gain keeps that gain here — it did not stop having happened.
      profit: afterTax(invested + proceeds - contributed, taxRate),
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
      proceeds: last.proceeds,
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
  const percent = toNumber(taxRate);
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
  ['profit', (p, projection) => afterTax(p.invested + p.proceeds - p.contributed, projection.taxRate)],
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

/**
 * The month the cash runs out, and how far under it goes at the worst.
 *
 * `net` is the running cash balance — everything in less everything out — so a
 * negative one is an overdraft nobody arranged. The summary otherwise reports
 * the *average* net over the whole horizon, and an average is exactly the
 * reading that hides this: a plan can be twenty thousand under at month twenty,
 * be rescued by something later, and still average out to a comfortable
 * surplus. Averaged, the app answers "can I afford this?" — its own reason for
 * existing — with a figure nobody ever lives through.
 *
 * Read from the points rather than stored on the projection, because
 * `inTodaysMoney` restates the points and spreads everything else through
 * unchanged: a month kept on the projection would survive that spread and go
 * stale. The month itself is the same either way — deflating divides by a
 * positive factor, which cannot change a sign — but `worst` is an amount, and
 * an amount has to be in the money the reader is being shown.
 *
 * @param {object} projection
 * @returns {{month: number, worst: number}|null} null when the cash never dips
 */
export function runsDryAt(projection) {
  let first = null;
  let worst = 0;
  for (const point of projection.points) {
    if (point.net >= 0) continue;
    if (first === null) first = point.month;
    if (point.net < worst) worst = point.net;
  }
  return first === null ? null : { month: first, worst };
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

/**
 * The same series read a month at a time: what moved *during* each month,
 * rather than everything that has moved since month 0.
 *
 * A first difference of what `project()` already returns, and that is the whole
 * of it — the model is asked for nothing new and nothing extra is stored, so
 * every rule the loop above follows (a yearly bill landing at month 12, a
 * one-off, a window that closes) is already in the answer. It is the only
 * reading that can say whether there is a month where more goes out than comes
 * in: a cumulative net is a running total and hides that inside itself.
 *
 * It works on a balance as readily as on a flow. The difference between two
 * months of `worth` is how much better off that month left you, which is a
 * real quantity even though it is not money moving.
 *
 * Month 0 is nought, deliberately. It has no month before it, so nothing can
 * have moved during it — and the alternative, letting it carry the opening
 * balance through, would put the house you already own into a card headed
 * "each month" and read as a month's income.
 */
export function monthlyOf(projection, key) {
  const { points } = projection;
  return points.map((point, index) => ({
    month: point.month,
    // Rounded rather than taken as it comes: both figures are exact to the
    // cent, but the difference of two doubles is not, and a card reading
    // "each month" is exactly where a stray 0.009999999999 would show.
    value: index === 0 ? 0 : roundMoney(point[key] - points[index - 1][key]),
  }));
}

/**
 * How far an amount is moved to find out what it is worth: a tenth of itself,
 * each way. Big enough that the answer is not rounding, small enough that it is
 * still a question about the plan the reader wrote rather than about a
 * different one.
 */
export const SWING = 0.1;

/**
 * Which of a plan's figures actually decide where it lands.
 *
 * A plan can hold a hundred fields and nothing in the app says which two of
 * them settle the answer — which is the question underneath most of the
 * others. Somebody weighing up three ways to buy a house is asking what the
 * outcome is sensitive to, and until this the only way to find out was to edit
 * a figure, look at what happened, and edit it back. So every amount is moved
 * a tenth up and a tenth down in turn, everything else left exactly where it
 * is, and the distance between those two runs is that field's weight.
 *
 * `project()` being pure and cheap is what makes it affordable: a hundred
 * fields is two hundred projections, and the app already runs several per
 * keystroke for the range band.
 *
 * **The swings add up.** The model is separable by construction — every field's
 * contribution is worked out on its own and only then summed — so moving two
 * amounts moves the figure by both swings, to the cent. That is also the limit
 * of the reading rather than a flaw in it: the list will rank a mortgage and
 * the house it bought one above the other and can never say that they were one
 * decision. `profit` is the one exception, because the tax falls on the gain as
 * a whole rather than on each part of it, so a field that tips that whole
 * across zero changes what every other field is worth.
 *
 * @param {object} projection the plan as it stands
 * @param {string} key which of the totals to watch
 * @param {(fields: Array<object>) => object} run how to project a list of
 *   fields. Handed in because which money the figures are read in — restated or
 *   not, at what inflation, taxed at what rate — is the reader's business and
 *   not the model's, and the swings have to be in the same money as the page
 *   they are shown on.
 * @returns {Array<{field: object, swing: number}>} largest swing first
 */
export function swingsOf(projection, key, run) {
  return projection.fields
    // An amount that was never entered moves nothing, and a row saying so for
    // every half-filled field would bury the answer under the question.
    .filter((field) => toAmount(field.amount) > 0)
    .map((field) => {
      const at = (fraction) => run(
        raiseAmount(projection.fields, field.id, fraction, toAmount),
      ).totals[key];
      // Signed, because which way the figure goes when there is more of this is
      // half of what the reader came for. Only the size decides the order.
      return { field, swing: roundMoney(at(SWING) - at(-SWING)) };
    })
    .sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing));
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
