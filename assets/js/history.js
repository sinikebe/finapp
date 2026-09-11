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
 * Exactly the keys `save()` writes into `finapp.state.v3`, in the order it
 * writes them.
 *
 * A snapshot is the plan as the store would have held it a moment ago, so this
 * list and that call are one fact said in two places — which is why a test
 * greps `save()` and holds the two together, rather than trusting anyone to
 * remember. Nine of them: the eight a plan has carried since strategies
 * arrived, and the targets marked on it.
 *
 * Projects did not lengthen this list, and that is the point. Four of the nine
 * are the open project's plan and five are the assumptions, and a snapshot is a
 * photograph of **one project** — named by `at` — rather than of the shelf.
 * A photograph of the shelf would have to be restored over work done in another
 * project since, which is not an undo; it is somebody else's plan written over
 * yours. Only the two moves that actually throw a project away carry the shelf
 * as well, and even they put back only what is missing (see `restoreShelf`).
 */
export const SNAPSHOT_KEYS = [
  'strategies', 'activeId', 'months', 'inflation',
  'realMoney', 'spread', 'showRange', 'tax', 'milestones',
];

/**
 * The moves a reader can take back, and the only values a snapshot's `what`
 * ever holds.
 *
 * Six now, and the new one is the largest of them: a project is every plan in
 * it, its horizon and its targets, thrown away by one press.
 *
 * Every one of these throws something away — which is what puts them on the
 * list and keeps a keystroke off it.
 *
 * They are here rather than in the app because the list is a fact about the
 * feature and the wording is not: the strings move with the language and the
 * case does not, so what is remembered is which of the six happened and the
 * words are found again on every render.
 */
export const UNDOABLE = ['field', 'strategy', 'project', 'milestone', 'reset', 'shared'];

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
 * Photograph one project before something takes a piece of it away.
 *
 * `at` is the whole of what projects added here: the id of the project this is
 * a photograph of. Not its position as well — a shelf snapshot restores the
 * order it photographed, so every project goes back where it sat and the one
 * that returns needs no coordinates of its own. Everything else about a
 * snapshot is what it always was.
 *
 * `shelf` is handed in only by the three moves that change which projects there
 * are — removing one, starting again, and opening somebody's link as a project
 * of its own — because they are the only ones whose undo has to put a record
 * back or take one away. Every other move leaves the shelf exactly as it found
 * it, so photographing it would be storing a copy of work the reader is still
 * doing in order to overwrite it later.
 *
 * @param {Array<object>} stack the snapshots so far, oldest first
 * @param {string} what which of `UNDOABLE` is about to happen
 * @param {object} source the nine keys, as the store would hold them — the live
 *   state for a move made in the project on screen, and the departing project's
 *   own plan for a removal, which is a move made *to* a project rather than in
 *   one
 * @param {string} at the id of the project it is a photograph of
 * @param {Array<object>} [shelf] the projects list, for the three moves that
 *   change which projects there are
 * @param {Array<string>} [born] the projects this move is about to create, so
 *   undoing it takes them away again rather than leaving them behind. A list,
 *   not one id: starting again makes as many as a first run does.
 * @returns {Array<object>} a new stack with the snapshot on top, bounded
 */
export function remember(stack, what, source, at, shelf, born) {
  const list = Array.isArray(stack) ? stack : [];
  const plan = {};
  for (const key of SNAPSHOT_KEYS) plan[key] = source[key];
  // Through JSON because the store is JSON: a snapshot is byte-for-byte what
  // `save()` would have written, so nothing can go into one that could not have
  // come back out of the store — and the copy is deep, which is what makes the
  // snapshot a photograph rather than another name for the live lists.
  const snapshot = { what, at, plan: JSON.parse(JSON.stringify(plan)) };
  if (shelf) snapshot.shelf = JSON.parse(JSON.stringify(shelf));
  if (born && born.length) snapshot.born = born;
  // The oldest goes over the side. Ten moves back is the promise; holding the
  // eleventh would quietly turn a bounded stack into a growing one.
  return [...list, snapshot].slice(-MAX_UNDO);
}

/**
 * Whether a snapshot is one the reader can be offered right now.
 *
 * A snapshot that carries a shelf is about the shelf, so it is always
 * offerable: the project it would put back is, by definition, not the one on
 * screen. Every other snapshot is a photograph of one project's plan, and
 * restoring it while standing somewhere else would write that plan over a
 * different question — so it waits, on the stack, until the reader is back in
 * the project it is about. **It is not thrown away.** Changing subject and
 * changing back is a way of looking rather than a change, and it now costs the
 * reader nothing: the removal they made in the first project is still there to
 * take back when they return to it.
 */
function offerable(snapshot, openId, fits) {
  if (snapshot.shelf) return fits(snapshot);
  return snapshot.at === openId;
}

/** Where the top offerable snapshot sits, or -1. */
function topIndex(list, openId, fits) {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (offerable(list[index], openId, fits)) return index;
  }
  return -1;
}

/**
 * The snapshot the next press would restore, without taking it.
 *
 * What the control is drawn from: whether there is anything to undo *here* at
 * all, and which of the six it would be — the button names the move it takes
 * back rather than offering a bare "Undo" and letting the reader find out.
 *
 * @returns {object|null} the top offerable snapshot, or null when there is none
 */
export function nextBack(stack, openId, fits = () => true) {
  const list = Array.isArray(stack) ? stack : [];
  const index = topIndex(list, openId, fits);
  return index === -1 ? null : list[index];
}

/**
 * Take the top offerable snapshot off, and hand back both halves.
 *
 * Both, rather than mutating the stack, for the reason every operation in this
 * project hands back a new list: the caller decides when its own stack becomes
 * the new one, and a half-applied undo is not a state anything here can be in.
 *
 * The snapshots below it are kept, including any belonging to other projects —
 * taking one back is not a reason to forget the rest.
 *
 * @returns {{snapshot: object, rest: Array<object>}|null} null when empty
 */
export function takeBack(stack, openId, fits = () => true) {
  const list = Array.isArray(stack) ? stack : [];
  const index = topIndex(list, openId, fits);
  if (index === -1) return null;
  return { snapshot: list[index], rest: [...list.slice(0, index), ...list.slice(index + 1)] };
}

/**
 * The shelf a snapshot restores: its own order, and everybody else's *current*
 * contents.
 *
 * The line that makes carrying a shelf in a snapshot safe. A photograph taken
 * before a removal also contains every other project as it was at that moment,
 * and writing that back would revert whatever the reader has done in them
 * since — which is the exact bug a whole-store snapshot has. So the photograph
 * supplies only what is *missing*: a project that still exists keeps the plan
 * it has now, and one that is gone comes back from the picture.
 *
 * The order is the photograph's, so a project returns to the place it sat in
 * rather than to the end of the list — and a project *started* since the
 * photograph was taken is kept, on the end, because it is work too and the
 * picture simply predates it. Which is why this can hand back a longer list
 * than either of the two it was given, and why the caller has to know whether
 * there is room before it offers the undo at all.
 *
 * The exception is the projects the photographed move *itself* created, named by
 * `born`. Opening a link as its own project makes one and starting again makes
 * a first run's worth, and taking either move back has to take them with it —
 * otherwise undoing "open as its own project" would leave the stranger's plans
 * sitting on the shelf, which is most of what the reader was undoing.
 *
 * @param {Array<object>} shelf the projects as the snapshot has them
 * @param {Array<object>} live the projects as they are now
 * @param {Array<string>} [born] projects the move created, which go back with it
 */
export function restoreShelf(shelf, live, born = []) {
  const made = new Set(born);
  const now = new Map(live.map((project) => [project.id, project]));
  const pictured = new Set(shelf.map((project) => project.id));
  return [
    ...shelf.map((project) => now.get(project.id) || project),
    ...live.filter((project) => !pictured.has(project.id) && !made.has(project.id)),
  ];
}

/** How many projects a snapshot's shelf would put back that are not there now. */
export function missingFrom(snapshot, live) {
  if (!snapshot.shelf) return 0;
  const now = new Set(live.map((project) => project.id));
  return snapshot.shelf.filter((project) => !now.has(project.id)).length;
}

/**
 * Whether the shelf would still be a legal size once this snapshot is restored.
 *
 * Two halves, and the second is the one that was got wrong. What comes *back*
 * is every photographed project that is gone now. What **stays** is everything
 * live except the projects the move itself made — `born` — because taking the
 * move back takes those away in the same breath. Count them as staying and
 * "Start again" looks like it needs room for its own new shelf beside the old
 * one, which it never has, so its undo is silently never offered.
 *
 * @param {object} snapshot the snapshot that would be restored
 * @param {Array<object>} live the projects as they are now
 * @param {number} max how many the shelf may hold
 */
export function fitsAfterUndo(snapshot, live, max) {
  const born = new Set(snapshot.born || []);
  const staying = live.filter((project) => !born.has(project.id)).length;
  return staying + missingFrom(snapshot, live) <= max;
}
