/**
 * solve.js — the same question, asked backwards.
 *
 * The app answers *"what happens if I put in 300 a month?"*. The question
 * people arrive with is usually its inverse: *"what must I put in to have
 * 100,000 in fifteen years?"* — the destination is known and the figure is not.
 * A target the plan never reaches is precisely where that question comes up,
 * which is why nothing here has an entry point of its own: it is a verb on a
 * target, offered where the target says it is never met.
 *
 * There is no new model here, and there could not be one. `project()` is pure
 * and cheap, so the whole of this is a loop around it: bracket the answer
 * between the model's own limits, halve the bracket until what is left is
 * smaller than the figure would ever be written to, and hand back what remains.
 * Forty projections is a millisecond or two — the same bargain the range band
 * already strikes several times a keystroke.
 *
 * **The honest part is the refusing.** A search that hands back whichever
 * crossing it stumbles into first is lying in the friendly direction, which is
 * the one this project has refused everywhere else — a loss is never taxed, and
 * it is never handed back as a credit. Bisection is only entitled to an answer
 * where the relationship it is searching is monotone, so:
 *
 * - **Two figures are offered and no others.** An amount and a rate both enter
 *   the model as a scale on something, so more of either moves the answer one
 *   way and keeps going. A sell month does not: moving it changes both what the
 *   holding grew to and what the cash then bought. Nor does a loan's term,
 *   whose level payment is rounded to the cent *before* it is multiplied by the
 *   term, so a month longer can cost a few cents less over the whole run.
 *   Neither is on the list, and the list is the seam.
 * - **Both ends of the bracket are probed before anything is halved.** The
 *   target is not met where the plan stands; if it is met at *both* limits then
 *   the relationship has turned round somewhere between them, and the search
 *   says so rather than picking one of the two crossings.
 * - **The stretch past the answer is sampled**, because monotone is a claim
 *   about the whole of it and the bracket only ever saw its two ends.
 * - **And the figure that comes out goes back through `updateField` and is run
 *   again before it is shown.** That is what makes the answer a fact about the
 *   reader's own plan rather than about the search: the month named is read off
 *   a projection of the plan with that figure in it, by the same `whenMet` the
 *   line above it uses. A figure that does not reproduce the target on the way
 *   back through is not an answer, and is not offered as one.
 *
 * Nothing here writes into a plan. The answer is said and that is all: the
 * reader typed what is in those boxes, and an app that quietly replaced it with
 * something it had worked out would be taking a decision that was never its.
 */

import { updateField } from './fields.js';
import { MAX_AMOUNT, roundMoney } from './projection.js';
import { whenMet } from './milestones.js';

/**
 * The figures a plan can be asked backwards about, and the model's own bounds
 * on each.
 *
 * The bounds are the app's rather than something narrower, so a search can
 * never propose a plan the app would refuse to store — and rather than
 * something wider, so it can never propose one the model would quietly clamp
 * and then be unable to reproduce.
 *
 * The keys are the field attributes themselves. There is no mapping to keep in
 * step: adding a third figure here would mean first showing that moving it
 * carries the answer one way and keeps going, which is the whole of why there
 * are two.
 */
export const SOLVABLE = {
  amount: {
    // Every field has one, in all five kinds, and it always means the same
    // thing: more of it is more of whatever the field does.
    applies: () => true,
    // `toAmount` reads anything at or below nothing as nothing and caps at
    // MAX_AMOUNT, so this is the whole of the range the model can tell apart.
    low: 0,
    high: MAX_AMOUNT,
    // Whole units. An answer of 511.83 is precise and useless; 512 is honest
    // about what it is, which is a figure that clears the target rather than a
    // figure that lands exactly on it.
    step: 1,
  },
  annualRate: {
    // Every kind but the one-off, which is the only row that shows no rate box
    // at all — an answer naming a figure with nowhere to type it would be a
    // rather cruel one.
    applies: (field) => field.kind !== 'once',
    // What `monthlyGrowth` and `grownBy` will read: a return can be negative,
    // and a hundred per cent a year is already absurd ten times over. A loan's
    // interest floors at nothing rather than going negative, which leaves the
    // bottom half of its range flat — flat is not a reversal, and bisection is
    // untroubled by it.
    low: -100,
    high: 1000,
    // A tenth of a point. Nobody negotiates a mortgage to the hundredth, and an
    // answer written that way would claim a precision the model has not got.
    step: 0.1,
  },
};

/** The figures, in the order they are offered. */
export const KNOBS = Object.keys(SOLVABLE);

/**
 * How many points between the answer and the far limit are checked to still
 * meet the target.
 *
 * Three, which is not a proof and is not meant to be one — a bounded number of
 * projections cannot prove a continuous claim. It is there to catch the shape
 * the two end probes cannot see, which is a relationship that helps, stops
 * helping, and helps again.
 */
const PROBES = 3;

/**
 * Every figure in a plan that can be asked backwards about.
 *
 * A field with an empty amount is deliberately still on the list. `swingsOf`
 * skips those, because an amount nobody entered moves nothing and ranking it
 * would bury the answer under the question — but *"what would I have to put in
 * here?"* is asked of an empty box more often than of a full one.
 *
 * @param {Array<object>} fields the plan as it stands
 * @returns {Array<{key: string, field: object, knob: string}>}
 */
export function candidatesOf(fields) {
  const list = [];
  for (const field of Array.isArray(fields) ? fields : []) {
    for (const knob of KNOBS) {
      if (SOLVABLE[knob].applies(field)) list.push({ key: `${field.id}:${knob}`, field, knob });
    }
  }
  return list;
}

/**
 * A figure rounded to the far side of the goal: up where more is wanted, down
 * where less is.
 *
 * Rounding towards the goal would hand back a figure that misses it by a
 * fraction of a unit, which is the one thing the answer must not do. The hair
 * of tolerance keeps a bisection's last few bits from pushing an answer that
 * already sits on a whole unit a whole unit further out.
 */
function roundAway(value, step, up) {
  const scaled = value / step;
  const whole = up ? Math.ceil(scaled - 1e-9) : Math.floor(scaled + 1e-9);
  // Through the money rounder, so a tenth of a point comes back as 6.3 rather
  // than as the 6.300000000000001 that multiplying it out actually gives.
  return roundMoney(whole * step);
}

/** The plan with one figure set to `value`, exactly as typing it would leave
 *  it: through `updateField`, so the normalisation, the caps and the coercion
 *  a typed figure goes through are ones the answer has been through too. */
function withFigure(fields, id, knob, value) {
  return updateField(fields, id, { [knob]: String(value) });
}

/**
 * What one figure would have to be for a target to be met.
 *
 * @param {{
 *   fields: Array<object>,
 *   fieldId: string,
 *   knob: string,
 *   milestone: {metric: string, amount: string},
 *   run: (fields: Array<object>) => object,
 *   read: (amount: string) => number,
 * }} options `run` is handed in for the reason `swingsOf` takes it: which money
 *   the figures are read in — restated or not, at what inflation, taxed at what
 *   rate — is the reader's business and not the model's, and an answer has to
 *   be in the same money as the page it is shown on. `read` is the same reader
 *   the projection used, so the figure being searched for is the figure that
 *   was typed.
 * @returns {{answer: number, bound: 'least'|'most', month: number, value: number}
 *   | {refusal: 'unmoved'|'unreachable'|'reversal'|'unproven'}
 *   | null} `null` where there is nothing to solve at all — no such field, no
 *   such figure, or a target with nothing readable in it.
 */
export function solveFor(options) {
  const {
    fields, fieldId, knob, milestone, run, read,
  } = options;
  const spec = SOLVABLE[knob];
  const list = Array.isArray(fields) ? fields : [];
  const field = list.find((entry) => entry.id === fieldId);
  if (!spec || !field || !spec.applies(field)) return null;

  const target = read(milestone.amount);
  if (!Number.isFinite(target)) return null;

  const here = run(list);
  const first = here.points && here.points[0];
  if (!first || !(milestone.metric in first)) return null;

  /*
   * Which side counts as met is settled once, against the plan the reader
   * actually wrote, and then held for the whole search. `whenMet` decides it
   * from the month the plan opens on — and that month moves as the figure does.
   * A house already worth more than the target on the day it is bought would
   * flip the rule halfway through the bisection, and a search that changes its
   * question while it runs is answering neither of them.
   */
  const rising = first[milestone.metric] < target;
  const met = (far) => (rising ? far >= target : far <= target);
  /** How far towards the target the plan gets with this figure in it. */
  const reachAt = (value) => {
    const { points } = run(withFigure(list, fieldId, knob, value));
    let far = points[0][milestone.metric];
    for (const point of points) {
      const held = point[milestone.metric];
      if (rising ? held > far : held < far) far = held;
    }
    return far;
  };

  const atLow = reachAt(spec.low);
  const atHigh = reachAt(spec.high);
  // The target is not met where the plan stands — that is the whole reason this
  // was asked — and the plan stands between these two. So both limits meeting
  // it is a relationship that turned round somewhere in the middle, and there
  // are two crossings rather than one figure to name.
  if (met(atLow) && met(atHigh)) return { refusal: 'reversal' };
  if (!met(atLow) && !met(atHigh)) {
    // Worth telling apart: "you would need more of this than the app will hold"
    // and "this is not the figure that decides it" send a reader to two very
    // different next moves.
    return { refusal: atLow === atHigh ? 'unmoved' : 'unreachable' };
  }

  // Which limit meets it says which end of an answer the reader is being
  // handed: a floor to clear, or a ceiling to stay under.
  const bound = met(atHigh) ? 'least' : 'most';
  const far = bound === 'least' ? spec.high : spec.low;
  let yes = far;
  let no = bound === 'least' ? spec.low : spec.high;
  // Enough halvings to bring the bracket below the step the answer is written
  // to, and four more so the rounding is deciding the last digit rather than
  // the bisection's own remainder.
  const halvings = Math.ceil(Math.log2((spec.high - spec.low) / spec.step)) + 4;
  for (let step = 0; step < halvings; step += 1) {
    const middle = (no + yes) / 2;
    if (met(reachAt(middle))) yes = middle;
    else no = middle;
  }

  const answer = Math.min(spec.high, Math.max(spec.low, roundAway(yes, spec.step, bound === 'least')));

  // Monotone is a claim about the whole stretch past the answer, and the
  // bracket only ever looked at its two ends. A relationship that helps, stops
  // helping and helps again would satisfy both of those and still make "or
  // more" a lie.
  for (let probe = 1; probe <= PROBES; probe += 1) {
    if (!met(reachAt(answer + ((far - answer) * probe) / (PROBES + 1)))) {
      return { refusal: 'reversal' };
    }
  }

  // The figure put back into the plan and read exactly the way the line above
  // it reads one. Without this the month shown would be the search's own
  // arithmetic; with it, it is what the reader would see having typed the
  // figure themselves. A figure that does not reproduce the target on the way
  // back through is not an answer, and nothing is said in its place.
  const proven = run(withFigure(list, fieldId, knob, answer));
  const reading = whenMet(proven, milestone, read);
  if (!reading || reading.month === null) return { refusal: 'unproven' };
  return {
    answer, bound, month: reading.month, value: reading.value,
  };
}
