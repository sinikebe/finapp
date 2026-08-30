/**
 * history.js — a bounded stack of plans, so a move that destroys work can be
 * taken back.
 *
 * The README has claimed the precondition for this since the field model went
 * in: *model operations are pure and return new lists*. Nothing had ever
 * collected on it. A state nothing mutates in place is a state that can be
 * photographed, and the app already photographs it several times a minute —
 * that is the whole of what `save()` does. So undo is not a new mechanism here.
 * It is the store's own serialisation, kept in memory for a moment longer than
 * the store keeps it.
 *
 * What a snapshot holds is exactly what `save()` writes, and `SNAPSHOT_KEYS` is
 * that list written down. Deliberately not a copy of the whole state object:
 * which reading the cards are in, which column the comparison shows, what the
 * solver was last asked, are ways of looking at a plan rather than parts of
 * one — and taking a plan back must not also drag the reader back to where they
 * were standing when they looked at it.
 *
 * Ten of them, dropped on reload. This is about the last minute of work rather
 * than about history: a stack in `localStorage` would outlive the tab, and on a
 * shared device it would hand the next person a way to resurrect plans the last
 * one deliberately threw away. That is also why the confirms and the grave
 * colour stay. Undo is a way back *while this tab is open, and not after*,
 * which is a smaller promise than "this is reversible" and has to keep being
 * made in those words.
 *
 * There is no redo. Undo alone covers every move that destroys something; redo
 * doubles the surface for a fraction of the answer.
 */

/**
 * Exactly the keys `save()` writes, in the order it writes them.
 *
 * A snapshot is the plan as the store would have held it a moment ago, so this
 * list and that call are one fact said in two places — which is why a test
 * greps `save()` and holds the two together, rather than trusting anyone to
 * remember. Nine of them: the eight a plan has carried since strategies
 * arrived, and the targets marked on it.
 */
export const SNAPSHOT_KEYS = [
  'strategies', 'activeId', 'months', 'inflation',
  'realMoney', 'spread', 'showRange', 'tax', 'milestones',
];

/**
 * The moves a reader can take back, and the only values a snapshot's `what`
 * ever holds.
 *
 * Five, not the four the gap was filed as: a target is removed by the same kind
 * of button a field is, and it takes a figure somebody typed with it. Every one
 * of these throws something away — which is what puts them on the list and
 * keeps an edit off it, because an edit can be typed back and a removal cannot.
 *
 * The names are cases rather than sentences: the wording follows the language
 * and the case does not, so what is remembered is which of the five happened
 * and the words are found again on every render.
 */
export const UNDOABLE = ['field', 'strategy', 'milestone', 'reset', 'shared'];

/**
 * How far back the app can go.
 *
 * Ten is the last minute of work, which is the thing being protected here.
 * Deeper would mostly buy the ability to walk a plan backwards past the point
 * the reader remembers being at, which is a different feature and a worse one —
 * and each snapshot is a whole plan, so the ceiling is what keeps a long
 * session's memory bounded rather than growing with it.
 */
export const MAX_UNDO = 10;

/* All of these return a new list; none mutate the one they are given. */

/**
 * Photograph the plan before something takes a piece of it away.
 *
 * @param {Array<object>} stack the snapshots so far, oldest first
 * @param {string} what which of `UNDOABLE` is about to happen
 * @param {object} state the live state object
 * @returns {Array<object>} a new stack with the snapshot on top, bounded
 */
export function remember(stack, what, state) {
  const list = Array.isArray(stack) ? stack : [];
  const plan = {};
  for (const key of SNAPSHOT_KEYS) plan[key] = state[key];
  // Through JSON because the store is JSON: a snapshot is byte-for-byte what
  // `save()` would have written, so nothing can go into one that could not have
  // come back out of the store — and the copy is deep, which is what makes the
  // snapshot a photograph rather than another name for the live lists.
  const snapshot = { what, plan: JSON.parse(JSON.stringify(plan)) };
  // The oldest goes over the side. Ten moves back is the promise; holding the
  // eleventh would quietly turn a bounded stack into a growing one.
  return [...list, snapshot].slice(-MAX_UNDO);
}

/**
 * The snapshot the next press would restore, without taking it.
 *
 * What the control is drawn from: whether there is anything to undo at all, and
 * which of the five it would be — the button names the move it takes back
 * rather than offering a bare "Undo" and letting the reader find out.
 *
 * @returns {object|null} the top snapshot, or null when there is nothing back
 */
export function nextBack(stack) {
  const list = Array.isArray(stack) ? stack : [];
  return list.length ? list[list.length - 1] : null;
}

/**
 * Take the top snapshot off, and hand back both halves.
 *
 * Both, rather than mutating the stack, for the reason every operation in this
 * project hands back a new list: the caller decides when its own stack becomes
 * the new one, and a half-applied undo is not a state anything here can be in.
 *
 * @returns {{snapshot: object, rest: Array<object>}|null} null when empty
 */
export function takeBack(stack) {
  const list = Array.isArray(stack) ? stack : [];
  if (!list.length) return null;
  return { snapshot: list[list.length - 1], rest: list.slice(0, -1) };
}
