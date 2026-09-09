/**
 * projects.js — one comparison each.
 *
 * A strategy is an answer. A **project is the question**: *how should I buy a
 * home?* is not *rent, buy or lease a car?*, and putting one plan from each on
 * the same axes compares nothing. So a project holds the four things that only
 * mean something inside one question — the strategies, which of them is on
 * screen, the horizon they are all read over, and the targets marked on them —
 * and nothing else.
 *
 * Everything else stays where it was, at the top of the state, because it is a
 * belief about the world rather than about the question: inflation, tax, the
 * spread, today's money, the range. A reader who thinks inflation is 3% thinks
 * so on both sides of the car decision and the house one, and holding two
 * copies of that belief would only let them quietly disagree — in a panel that
 * is folded shut by default, with nothing on screen saying so.
 *
 * ## Why the horizon is in and the assumptions are out
 *
 * The dividing line is not taste, and the proof is that the horizon decides
 * which fields *exist*. A purchase waiting on "when what I own reaches 12,000"
 * is placed by `schedule.js` off a projection run over `months`; read the same
 * plan over six months and the target is never met, so the purchase is not in
 * the plan at all. A number that changes which rows are on the chart is part of
 * the question being asked. Inflation is not: it changes what every row is
 * worth, in the same way, in every question on the device.
 *
 * ## The targets are in for a reason the model gives, not the copy
 *
 * A field holds a target's *id* in `startAt`/`endAt`/`sellAt`, and `schedule.js`
 * resolves it against the target list handed in beside the fields. Per project,
 * that id namespace is exactly the scope the fields live in — a field and the
 * target it waits on are always in the same list, always removed together, and
 * never carried across into another question. It is the only scoping under
 * which `schedule.js` stays sound without a line changing in it, and not a line
 * did.
 *
 * ## The open project is not on the shelf
 *
 * The app reads `state.strategies`, `state.activeId`, `state.months` and
 * `state.milestones` in thirty-two places, and every one of them means *the
 * project on screen*. So those four keys stay exactly where they are — and the
 * shelf holds **no plan at all** for the open one. One copy, so the two halves
 * of the store cannot disagree about the plan the reader is looking at, and so
 * that an older build's write into `finapp.state.v3` is the reader's latest
 * work rather than a copy to be reconciled against another.
 *
 * A shelved project holds exactly four keys under `plan`; the five assumptions
 * are absent from the shelf on purpose, so the shape itself states the scoping.
 */

import { newId } from './fields.js';
import { normalizeStrategies, activeIdOf } from './strategies.js';

/**
 * How many projects one device may hold.
 *
 * Six, for the reason `MAX_MILESTONES` is six: as many open questions as
 * anybody weighs at once. Every other derivation the design considered turned
 * out to bound nothing — the worst store six projects can make is about 700 KB
 * against a 5 MB quota, and the undo stack holds one project's history rather
 * than the shelf's — so the number is the readable-list one, said plainly.
 *
 * It also happens to be the last size where the whole list is *there* on the
 * smallest screen supported: on a 390x844 phone in French the sheet's box is
 * 608px, five rows fill 590 of it, six come to 664 and the last is one flick
 * down, and eight come to 812 — a third of the list off screen, which is a list
 * you search rather than read.
 */
export const MAX_PROJECTS = 6;

/** As long as a strategy's name, and for the same reason: it is read in a row
 *  of controls, and a name that outgrows the row stops being a label. */
export const MAX_NAME_LENGTH = 40;

/** The keys a project owns. Written down once because the switch, the store and
 *  the snapshot all have to agree on the same four, and three copies of a list
 *  is three chances to disagree. */
export const PROJECT_KEYS = ['strategies', 'activeId', 'months', 'milestones'];

/**
 * Coerce anything into a well-formed plan — the four keys, and only those.
 *
 * The horizon and the targets are handed through the app's own coercions rather
 * than trusted, for the reason a link is: a hand-edited store may not put a
 * value in the app that the app could not have made itself.
 *
 * @param {unknown} value whatever a store offers
 * @param {{months: (v: unknown) => number, milestones: (v: unknown) => Array}} coerce
 */
export function normalizePlan(value, coerce) {
  const source = value && typeof value === 'object' ? value : {};
  const strategies = normalizeStrategies(source.strategies);
  return {
    strategies,
    activeId: activeIdOf(strategies, source.activeId),
    months: coerce.months(source.months),
    milestones: coerce.milestones(source.milestones),
  };
}

/**
 * Coerce anything into a well-formed project.
 *
 * `plan` is `null` when the record is the open one — its plan is the flat store
 * and there is no second copy anywhere. A record that arrives with no plan and
 * is *not* the open one is a switch that did not finish; it gets an empty plan
 * rather than being dropped, because a named project with nothing in it is a
 * smaller loss than a project that vanished.
 */
export function normalizeProject(value, coerce, open) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    id: typeof source.id === 'string' && source.id ? source.id : newId(),
    // Empty means unnamed, exactly as it does for a strategy: the switcher
    // shows something else rather than storing a name nobody typed.
    name: typeof source.name === 'string' ? source.name.trim().slice(0, MAX_NAME_LENGTH) : '',
    // A name the app gave it, so the project it opens with follows the reader's
    // language the way an untouched field's label does. Held to the shape of a
    // default project's name for the reason a strategy's `nameKey` is: it comes
    // in from a link and goes out through the dictionary.
    nameKey: typeof source.nameKey === 'string' && /^project\.default\.[a-zA-Z]+$/.test(source.nameKey)
      ? source.nameKey : '',
    plan: open ? null : normalizePlan(source.plan, coerce),
  };
}

/**
 * Coerce anything into a list with at least one project, unique ids, and
 * exactly one record — the open one — carrying no plan.
 *
 * That last clause is the invariant the whole store rests on, and it is
 * enforced here rather than trusted, because it is the one thing a hand-edited
 * or half-written store could break in a way nothing downstream would notice.
 */
export function normalizeProjects(value, coerce, wanted) {
  const list = (Array.isArray(value) ? value : []).slice(0, MAX_PROJECTS);
  const seen = new Set();
  const ids = list.map((entry) => {
    const id = entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id
      && !seen.has(entry.id) ? entry.id : newId();
    seen.add(id);
    return id;
  });
  const openId = ids.includes(wanted) ? wanted : ids[0];
  const projects = list.map((entry, index) => ({
    ...normalizeProject(entry, coerce, ids[index] === openId),
    id: ids[index],
  }));
  return projects.length ? projects : [normalizeProject({}, coerce, true)];
}

/** The id that should be open: the one asked for, if it still exists. */
export function openIdOf(projects, wanted) {
  const list = Array.isArray(projects) && projects.length ? projects : [];
  return list.some((project) => project.id === wanted) ? wanted : (list[0] ? list[0].id : '');
}

/**
 * What to call a project: the reader's name, else the one the app gave it,
 * else — and only when it is the only one there is — the form's own heading.
 *
 * The last case is what an upgrading reader sees and it is the whole of the
 * migration on screen: a store written before projects existed becomes one
 * unnamed project, and one unnamed project is not called "Project 1", it is
 * called what the panel above it has always been called. Nothing has appeared
 * to be named, because nothing has.
 */
export function nameOf(project, index, count, t) {
  if (project.name) return project.name;
  if (project.nameKey) {
    const translated = t(project.nameKey);
    if (translated !== project.nameKey) return translated;
  }
  if (count <= 1) return t('inputs.heading');
  return t('project.defaultName', index + 1);
}

/* ------------------------------------------------------------- operations */
/* All of these return a new list; none mutate the one they are given. */

/** The four keys off the live state — the open project's plan, wherever it is
 *  going next. */
export function planOf(state) {
  const plan = {};
  for (const key of PROJECT_KEYS) plan[key] = state[key];
  return plan;
}

/**
 * Move the plan on screen into `id`'s record, and take `to`'s out.
 *
 * The one operation that touches two records, and the only place a plan is ever
 * copied at all. It hands back both halves — the shelf, and the four keys to
 * assign — so that the moment where two copies exist is a single expression
 * rather than a window between two statements.
 *
 * @returns {{projects: Array<object>, plan: object}}
 */
export function moveOpen(projects, from, to, state) {
  const parked = planOf(state);
  const arriving = projects.find((project) => project.id === to);
  const plan = arriving && arriving.plan ? arriving.plan : parked;
  return {
    projects: projects.map((project) => {
      if (project.id === to) return { ...project, plan: null };
      if (project.id === from) return { ...project, plan: parked };
      return project;
    }),
    plan,
  };
}

/** Park the plan on screen into `id`'s record without opening anything else.
 *  Used where the shelf itself is what is being photographed or written. */
export function parkOpen(projects, id, state) {
  const parked = planOf(state);
  return projects.map((project) => (project.id === id ? { ...project, plan: parked } : project));
}

export function addProject(projects, project) {
  if (projects.length >= MAX_PROJECTS) return projects;
  return [...projects, project];
}

export function updateProject(projects, id, patch) {
  return projects.map((project) => (project.id === id
    ? {
      ...project,
      ...patch,
      id: project.id,
      name: typeof patch.name === 'string'
        ? patch.name.slice(0, MAX_NAME_LENGTH)
        : project.name,
    }
    : project));
}

/** Remove a project. The list never empties: the last one stays, for the
 *  reason the last strategy does — there is always something on screen. */
export function removeProject(projects, id) {
  if (projects.length <= 1) return projects;
  return projects.filter((project) => project.id !== id);
}

/** Which project takes over when `id` goes: the next, else the previous. */
export function neighbourOf(projects, id) {
  const index = projects.findIndex((project) => project.id === id);
  if (index === -1) return projects[0].id;
  return (projects[index + 1] || projects[index - 1] || projects[0]).id;
}
