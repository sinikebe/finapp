/**
 * strategies.js — the strategies.
 *
 * A strategy is a named set of fields: "what I do now", "if I buy the flat",
 * "if I put the raise into the index fund". They share one horizon, so the
 * curves are comparable, and everything else about them is independent.
 *
 * The app always holds at least one. A reader who never compares anything sees
 * nothing of this: the single strategy is unnamed, and the comparison view
 * appears only once there is something to compare against.
 */

import { normalizeFields, newId } from './fields.js';

/**
 * Four is the ceiling because four is how many series colours the palette can
 * seat while every pair stays distinguishable — including for a reader with
 * colour-vision deficiency, in both themes. A fifth strategy would have to be
 * told apart by name alone.
 */
export const MAX_STRATEGIES = 4;

export const MAX_NAME_LENGTH = 40;

/** Coerce anything into a well-formed strategy. */
export function normalizeStrategy(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    id: typeof source.id === 'string' && source.id ? source.id : newId(),
    // Empty means unnamed: the bar shows its position instead, translated, so
    // an untouched strategy follows the language like an untouched field does.
    name: typeof source.name === 'string' ? source.name.trim().slice(0, MAX_NAME_LENGTH) : '',
    fields: normalizeFields(source.fields),
  };
}

/** Coerce anything into a list with at least one strategy and unique ids. */
export function normalizeStrategies(value) {
  const list = (Array.isArray(value) ? value : []).slice(0, MAX_STRATEGIES);
  const seen = new Set();
  const strategies = list.map((entry) => {
    const strategy = normalizeStrategy(entry);
    if (seen.has(strategy.id)) strategy.id = newId();
    seen.add(strategy.id);
    return strategy;
  });
  return strategies.length ? strategies : [normalizeStrategy({})];
}

export function createStrategy(patch = {}) {
  return normalizeStrategy({ ...patch, id: patch.id || newId() });
}

/** What to call a strategy: the reader's name, else its position. */
export function nameOf(strategy, index, t) {
  return strategy.name || t('strategy.defaultName', index + 1);
}

/** The id that should be active: the one asked for, if it still exists. */
export function activeIdOf(strategies, wanted) {
  const list = normalizeStrategies(strategies);
  return list.some((strategy) => strategy.id === wanted) ? wanted : list[0].id;
}

/* ------------------------------------------------------------- operations */
/* All of these return a new list; none mutate the one they are given. */

export function addStrategy(strategies, patch = {}) {
  const list = normalizeStrategies(strategies);
  if (list.length >= MAX_STRATEGIES) return list;
  return [...list, createStrategy(patch)];
}

export function updateStrategy(strategies, id, patch = {}) {
  return normalizeStrategies(strategies).map(
    (strategy) => (strategy.id === id ? normalizeStrategy({ ...strategy, ...patch, id: strategy.id }) : strategy),
  );
}

/**
 * Copy a strategy, fields and all, right after the original — the usual way to
 * start a comparison is "the same, but…".
 * @param {(name: string) => string} nameCopy how to name the copy
 */
export function duplicateStrategy(strategies, id, nameCopy, t) {
  const list = normalizeStrategies(strategies);
  const index = list.findIndex((strategy) => strategy.id === id);
  if (index === -1 || list.length >= MAX_STRATEGIES) return list;

  const source = list[index];
  const copy = createStrategy({
    // Fields are copied with new ids, so editing one strategy never reaches
    // into another.
    fields: source.fields.map((field) => ({ ...field, id: newId() })),
    // A copy of something named is "that, again"; a copy of something unnamed
    // stays unnamed and simply takes the next position.
    name: source.name ? nameCopy(nameOf(source, index, t)) : '',
  });
  return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
}

/** Remove a strategy. The list never empties: the last one stays. */
export function removeStrategy(strategies, id) {
  const list = normalizeStrategies(strategies);
  if (list.length <= 1) return list;
  return list.filter((strategy) => strategy.id !== id);
}

/** Which strategy takes over when `id` goes: the next, else the previous. */
export function neighbourOf(strategies, id) {
  const list = normalizeStrategies(strategies);
  const index = list.findIndex((strategy) => strategy.id === id);
  if (index === -1) return list[0].id;
  const neighbour = list[index + 1] || list[index - 1] || list[0];
  return neighbour.id;
}

/**
 * Carry a store from before strategies existed — a bare list of fields — into
 * one unnamed strategy, so nobody loses what they had entered.
 */
export function migrateFields(fields) {
  return [createStrategy({ fields })];
}
