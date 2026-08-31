/**
 * milestones.js — targets, and the month each one is met.
 *
 * The largest limitation this app declares about itself is that nothing in the
 * model is conditional: the month each renter can afford the house was worked
 * out from the figures by hand and written into `strategies.js`, because "as
 * soon as savings reach 100,000" is not a rule a projection can obey. It still
 * is not one, and nothing in this file makes it one.
 *
 * But it never had to be. *"The first month savings reach 100,000"* is not a
 * rule the model follows — it is a **read over the answer**, and the answer is
 * already sitting in `projection.points`. So a milestone is a question put to a
 * projection that has already been run: nothing here can change what the model
 * says, only find a month inside what it said. That is why the feature costs
 * nothing — no conditionals, no second pass over the fields, and no palette
 * slot either, because a target is a rule and a label rather than a series.
 *
 * A target is a metric and a figure, and deliberately nothing else. "When does
 * the fund cover the house?" is a fair question and it is not this one; it
 * would need a second thing to compare against, a second vocabulary to say it
 * in, and a reader to learn both. One shape, asked well, first.
 *
 * **A target may also be given a name, and a named one can be waited on.** That
 * is the one thing here that reaches back into the plan: a field may take its
 * first month, its last, or the month it is sold from a named target rather
 * than from a figure, so "buy it once the savings are there" becomes something
 * the plan can say instead of a month somebody worked out by hand. The model is
 * still not conditional — `contributionOf` never sees anything but a number.
 * What resolves the name to a month is `schedule.js`, which runs the projection
 * to read the target and then runs it again with the month it found, before the
 * projection the reader sees is built at all. The name is the seam; nothing
 * downstream of it knows there was ever a question.
 *
 * Which quantities may be targeted is handed in rather than listed here, for
 * the reason `raiseAmount` takes its own reader: the eight the comparison
 * offers are the app's business, and there is exactly one list of them.
 */

import { newId } from './fields.js';
import { DEFAULT_PLAN } from './strategies.js';

/**
 * How many targets one plan may carry.
 *
 * Six, because every one of them draws a rule on every card at once: five cards
 * under a dozen rules is a barcode, and a target nobody can pick out from the
 * others has stopped answering the question it was asked. It is also plenty —
 * a plan has two or three moments in it worth naming, not twenty.
 */
export const MAX_MILESTONES = 6;

/** As long as a strategy's name, for the same reason: it is read in a row of
 *  controls and a name that outgrows the row stops being a label. */
export const MAX_MILESTONE_NAME = 40;

/** The targets a field may wait on: the named ones, in the order they are in.
 *  An unnamed target is not offered, because a menu of blanks is not a menu. */
export function waitableOf(milestones) {
  return (Array.isArray(milestones) ? milestones : []).filter((one) => one && one.name);
}

/**
 * Coerce anything into a well-formed target.
 *
 * @param {unknown} value whatever a store, a link or a caller offers
 * @param {Array<string>} metrics the quantities that may be targeted, in the
 *   order they are offered. A metric that is not one of them reads as the
 *   first, the same way a direction that is not a direction reads as the
 *   default — a hand-edited store may not put a quantity in the app that the
 *   app has no column for.
 */
export function normalizeMilestone(value, metrics) {
  const source = value && typeof value === 'object' ? value : {};
  const known = Array.isArray(metrics) ? metrics : [];
  return {
    id: typeof source.id === 'string' && source.id ? source.id : newId(),
    // A name is what makes a target waitable: an unnamed one is still read and
    // still drawn, but nothing can refer to it, because there is nothing to
    // refer to it by. Empty is the default, so every target written before
    // names existed stays exactly what it was.
    name: typeof source.name === 'string' ? source.name.trim().slice(0, MAX_MILESTONE_NAME) : '',
    metric: known.includes(source.metric) ? source.metric : (known[0] || ''),
    // Kept exactly as it was typed, like a field's amount: the reader's own
    // separators survive, and whoever reads the figure says how.
    amount: typeof source.amount === 'number' || typeof source.amount === 'string'
      ? String(source.amount)
      : '',
  };
}

/** Coerce anything into a well-formed list: unique ids, bounded length. */
export function normalizeMilestones(value, metrics) {
  const list = Array.isArray(value) ? value.slice(0, MAX_MILESTONES) : [];
  const seen = new Set();
  return list.map((entry) => {
    const milestone = normalizeMilestone(entry, metrics);
    if (seen.has(milestone.id)) milestone.id = newId();
    seen.add(milestone.id);
    return milestone;
  });
}

/* ------------------------------------------------------------- operations */
/* All of these return a new list; none mutate the one they are given. */

export function addMilestone(milestones, metrics, patch = {}) {
  const list = normalizeMilestones(milestones, metrics);
  if (list.length >= MAX_MILESTONES) return list;
  return [...list, normalizeMilestone({ ...patch, id: newId() }, metrics)];
}

export function updateMilestone(milestones, id, patch, metrics) {
  return normalizeMilestones(milestones, metrics).map((milestone) => (
    milestone.id === id
      ? normalizeMilestone({ ...milestone, ...patch, id: milestone.id }, metrics)
      : milestone
  ));
}

/* Removal and the search beside it take no metric list: neither can put a
 * quantity into the app, so neither needs the vocabulary to check one against. */

export function removeMilestone(milestones, id) {
  return (Array.isArray(milestones) ? milestones : []).filter((milestone) => milestone.id !== id);
}

/** The target that should take focus once `id` is gone: the next, else the previous. */
export function neighbourOf(milestones, id) {
  const list = Array.isArray(milestones) ? milestones : [];
  const index = list.findIndex((milestone) => milestone.id === id);
  if (index === -1) return null;
  const neighbour = list[index + 1] || list[index - 1];
  return neighbour ? neighbour.id : null;
}

/* ---------------------------------------------------------------- the read */

/**
 * The first month a target is met, read off a projection that already exists.
 *
 * **Which side counts as met is decided by the side the plan starts on.** A
 * total that opens below the figure is met by reaching it; one that opens at or
 * above it is met by falling to it. That is one rule rather than two, and it is
 * what lets "debt reaches 0" mean the month the debt is cleared while "worth
 * reaches 250,000" means the month it is first worth that — without the reader
 * ever having to say which direction they meant.
 *
 * **The first crossing, not the last.** A total can climb past a figure and
 * fall back again, and both months are true things to say; but the question the
 * section asks is *when does that happen*, and the answer to it is the first
 * time it does. The curve above the list shows the falling back, which is the
 * part a rule could not have said anyway.
 *
 * @param {object} projection a plan that has already been run
 * @param {{metric: string, amount: string}} milestone the target
 * @param {(amount: string) => number} read how to make a figure out of an
 *   amount as it was written down — the same reader the projection used, so the
 *   figure being watched for is the figure the reader typed.
 * @returns {{month: number|null, value: number}|null} the month it is met and
 *   what the quantity stood at there; `month: null` with the figure the
 *   projection ends at when it is never met; and `null` when there is nothing
 *   to read — an empty box, or a quantity this projection does not carry.
 */
export function whenMet(projection, milestone, read) {
  const points = projection && Array.isArray(projection.points) ? projection.points : [];
  const first = points[0];
  if (!first || !(milestone.metric in first)) return null;
  const target = read(milestone.amount);
  if (!Number.isFinite(target)) return null;

  const rising = first[milestone.metric] < target;
  for (const point of points) {
    const value = point[milestone.metric];
    if (rising ? value >= target : value <= target) return { month: point.month, value };
  }
  return { month: null, value: points[points.length - 1][milestone.metric] };
}

/* ---------------------------------------------------------------- defaults */

/**
 * What a first-time reader is asked on their behalf: when the house is theirs.
 *
 * One target, not three, for the reason the app opens on one strategy rather
 * than an empty form — an example is worth more than an affordance — and this
 * one in particular because the three plans the app opens with are three
 * answers to *when can I buy a 100,000 house*, and until now only the project
 * knew the months. The figure comes from the same constant those plans are
 * built from, so moving the house price moves the question with it.
 */
export function defaultMilestones() {
  return [{ metric: 'owned', amount: DEFAULT_PLAN.house }];
}
