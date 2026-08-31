/**
 * schedule.js — turning "when the savings are there" into a month.
 *
 * The app has always said that nothing in its model is conditional, and that is
 * still true where it matters: `contributionOf` reads `startMonth`, `endMonth`
 * and `sellMonth` as numbers and has never heard of a target. What changes here
 * is what happens *before* the projection the reader sees is built.
 *
 * A field may name a target instead of a month — `startAt`, `endAt`, `sellAt`
 * each hold a target's id. Resolving one is circular on its face: the month a
 * target is met comes out of a projection, and the projection needs the months.
 * So this module runs the loop:
 *
 *   1. Read each target off a projection of the plan **as it would run if that
 *      target never came** — every field waiting on it held back.
 *   2. Place everything with the months just found.
 *   3. If any month moved, go round again.
 *
 * **Step 1 is the whole design, and the first attempt got it wrong.** Reading a
 * target off the placed plan seems obviously right and is not: "buy the car
 * when the savings reach 12,000" watches savings that the purchase then spends,
 * so the crossing moves to the purchase, the purchase moves to the crossing,
 * and the two chase each other for ever. What the reader means by *the savings*
 * is the ones they were putting by — the trajectory without the thing they are
 * saving *for*. Holding back what waits on a target is that sentence, written
 * down.
 *
 * It also settles the confused question honestly. "Buy the house when what I
 * own reaches 100,000", where the house *is* what would be owned, reads the
 * plan without the house, finds nothing owned, and answers *never* — which is a
 * true answer to a question that answers itself, rather than one of the two
 * months a chase would have landed on.
 *
 * **Why it settles.** A field that starts in month M can only change the months
 * from M onward, so a crossing found before M is not something that field can
 * move. Save up then buy is stable after one round; a chain settles in about as
 * many rounds as the chain is long.
 *
 * **Why it sometimes still cannot.** Two targets can wait on each other's
 * consequences — the first purchase moves the second target, whose purchase
 * moves the first. Holding back cannot help there, because neither target is
 * the one being held. So the loop watches for a state it has already been in,
 * stops, and says it did not settle: the same posture the solver takes when it
 * is asked something not monotonic. Guessing would be picking one of two wrong
 * answers.
 */

import { MAX_MONTH_MARK } from './fields.js';
import { whenMet } from './milestones.js';

/**
 * How many times round before giving up.
 *
 * A chain settles in about as many rounds as it is long, and a plan may hold
 * six targets, so six rounds is the honest ceiling plus one to notice it has
 * stopped moving. The cycle check below usually stops it long before this;
 * the cap is for a wobble long enough to look like progress.
 */
const MAX_ROUNDS = 8;

/** Every field that is waiting on something, and what it is waiting on. */
const WAITS = [
  { at: 'startAt', month: 'startMonth' },
  { at: 'endAt', month: 'endMonth' },
  { at: 'sellAt', month: 'sellMonth' },
];

/** Whether anything in this plan waits on a target at all. */
export function waitsOnAnything(fields) {
  return (Array.isArray(fields) ? fields : []).some(
    (field) => WAITS.some((wait) => field[wait.at]),
  );
}

/**
 * The plan with every waited-on month replaced by the month it resolved to.
 *
 * A field whose *start* is unresolved is dropped: it has not begun. An
 * unresolved end or sale is simply left off — "not yet" for an ending is no
 * ending, which is what a reader who says "rent until I buy" means when the
 * buying never happens.
 */
function placed(fields, found, ignoring = null) {
  // `ignoring` is the target being read this pass: every field waiting on it is
  // held back, so the quantity is watched along the trajectory it would have
  // had if that target never came. See the note at the top — this argument is
  // the difference between a plan that settles and two months chasing.
  const monthFor = (id) => (id === ignoring ? null : found.get(id));
  const out = [];
  for (const field of fields) {
    const start = field.startAt ? monthFor(field.startAt) : null;
    if (field.startAt && !Number.isFinite(start)) continue;

    const next = { ...field };
    if (field.startAt) next.startMonth = start;
    for (const wait of WAITS.slice(1)) {
      if (!field[wait.at]) continue;
      const month = monthFor(field[wait.at]);
      next[wait.month] = Number.isFinite(month) ? month : 0;
    }
    out.push(next);
  }
  return out;
}

/** The resolution as one string, so a round can tell it has been here before. */
const stateOf = (found, ids) => ids.map((id) => `${id}:${found.get(id) ?? '-'}`).join('|');

/**
 * Resolve every named target this plan waits on, and hand back the plan with
 * real months in it.
 *
 * @param {object} options
 * @param {Array<object>} options.fields the plan as the reader wrote it
 * @param {Array<object>} options.milestones the targets, named and unnamed
 * @param {(fields: Array<object>) => object} options.run the caller's own
 *   projection pipeline — so a month is read in the money the reader is looking
 *   at, restated or not, exactly as `solve.js` and the ranking take theirs
 * @param {(amount: string) => number} options.read how to make a figure out of
 *   an amount as it was written down
 * @returns {{fields: Array<object>, months: Map<string, number|null>,
 *   settled: boolean, rounds: number}} the placed plan, what each target
 *   resolved to (null for one never met), whether the loop came to rest, and
 *   how many rounds it took
 */
export function schedule(options) {
  const fields = Array.isArray(options.fields) ? options.fields : [];
  const milestones = Array.isArray(options.milestones) ? options.milestones : [];
  const { run, read } = options;

  const waited = new Set();
  for (const field of fields) {
    for (const wait of WAITS) if (field[wait.at]) waited.add(field[wait.at]);
  }
  // Nothing waits on anything: the plan is already its own schedule, and the
  // projection the caller is about to run is the only one that need happen.
  if (!waited.size) {
    return { fields, months: new Map(), settled: true, rounds: 0 };
  }

  const watched = milestones.filter((one) => waited.has(one.id));
  const ids = watched.map((one) => one.id);
  // Every watched target starts explicitly at "not met", rather than merely
  // absent. The two read the same downstream, but not here: an absent entry
  // compares unequal to the `null` a first round finds, so a plan that
  // correctly resolves to *never* on its first look would report a month having
  // moved, and then match the opening state and be called a cycle.
  const found = new Map(ids.map((id) => [id, null]));
  const seen = new Set([stateOf(found, ids)]);

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    let moved = false;
    for (const milestone of watched) {
      // One projection per target, because each is read along a different
      // trajectory: its own, without the things waiting for it. Six targets is
      // the ceiling and a plan settles in a round or two, so this is a handful
      // of projections on a function built to be run many times a keystroke.
      const projection = run(placed(fields, found, milestone.id));
      const reading = whenMet(projection, milestone, read);
      // A target with nothing in it, or one never met, places nothing. Both
      // read the same way here on purpose: a field waiting on a month that has
      // not come has not started, whether the target is unanswerable or merely
      // unanswered.
      const month = reading && reading.month !== null && reading.month <= MAX_MONTH_MARK
        ? reading.month
        : null;
      if (found.get(milestone.id) !== month) moved = true;
      found.set(milestone.id, month);
    }
    if (!moved) return { fields: placed(fields, found), months: found, settled: true, rounds: round };

    const state = stateOf(found, ids);
    // Been here before: the months are going round rather than converging, so
    // there is no answer to settle on and saying so beats showing either half
    // of the loop as though it were the month.
    if (seen.has(state)) {
      return { fields: placed(fields, found), months: found, settled: false, rounds: round };
    }
    seen.add(state);
  }

  return { fields: placed(fields, found), months: found, settled: false, rounds: MAX_ROUNDS };
}
