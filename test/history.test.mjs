import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  MAX_UNDO, SNAPSHOT_KEYS, UNDOABLE, nextBack, remember, takeBack,
  restoreShelf, missingFrom, fitsAfterUndo,
} from '../assets/js/history.js';
import { LANGUAGES, STRINGS } from '../assets/js/i18n.js';

const app = await readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8');

/** A plan shaped like the one app.js holds, with something in every key. */
const planLike = () => ({
  strategies: [{ id: 'a', name: 'Mine', fields: [{ id: 'f', amount: '100' }] }],
  activeId: 'a',
  months: 240,
  inflation: '2',
  realMoney: false,
  spread: '3',
  showRange: false,
  tax: '30',
  milestones: [{ id: 'm', metric: 'owned', amount: '100000' }],
  // Not a part of a plan, and deliberately not in a snapshot: the reading the
  // cards are in is a way of looking rather than something the store holds.
  monthly: true,
});

/* -------------------------------------------------------------- the snapshot */

test('a snapshot holds exactly what save() writes, and nothing else', async () => {
  /*
   * The list and the call are one fact stated in two places, and the whole
   * feature rests on them agreeing: a key `save()` writes and a snapshot skips
   * is a piece of the plan undo silently declines to bring back, and one a
   * snapshot holds and `save()` does not is a piece of the app being restored
   * out of a store that never carried it.
   *
   * So the call is read rather than trusted. This is deliberately awkward to
   * satisfy — the fix for a failure here is to add the key to both, never to
   * loosen what is matched.
   */
  const body = app.split('function save() {')[1];
  assert.ok(body, 'app.js declares save()');
  const written = body.split('writeStore(STATE_KEY, {')[1].split('});')[0];
  const keys = [...written.matchAll(/(\w+):\s*state\.(\w+)/g)];
  // The tenth is the stamp: the project the nine belong to. It is written and
  // never snapshotted, because a snapshot already names its project in `at` and
  // a stamp inside the plan would be a second answer to the same question.
  const stamp = keys.pop();
  assert.deepEqual(stamp.slice(1), ['projectId', 'openProjectId']);
  assert.deepEqual(keys.map((match) => match[1]), SNAPSHOT_KEYS);
  for (const [, key, from] of keys) {
    assert.equal(key, from, `save() writes state.${from} under its own name`);
  }
});

test('the shelf is written first, and it is written under its own key', () => {
  /*
   * Both halves of one sentence about a torn write. Two keys are two chances
   * for a full quota to write half a save, and the half that matters is a
   * switch — the only save where a plan moves between the keys. The shelf takes
   * the departing project's plan, so it goes first: fail there and the pair
   * stops before the flat write can strand that plan with no copy anywhere.
   *
   * And the shelf lives under a key of its own so that `finapp.state.v3` stays
   * exactly the store a build from before projects knows how to read and write.
   * Move the shelf into it and one keystroke in a stale tab takes every project
   * with it, because that build writes the keys it knows and drops the rest.
   */
  const body = app.split('function save() {')[1].split('\n}')[0];
  assert.ok(
    body.indexOf('writeStore(PROJECTS_KEY') < body.indexOf('writeStore(STATE_KEY'),
    'the shelf is written before the plan on screen',
  );
  assert.ok(
    /if \(!writeStore\(PROJECTS_KEY/.test(body),
    'and a shelf that would not write stops the pair',
  );
  assert.ok(
    !app.includes("PROJECTS_KEY = 'finapp.state.v3'") && app.includes("PROJECTS_KEY = 'finapp.projects.v1'"),
    'the shelf is not inside the store an older build rewrites',
  );
});

test('what a snapshot leaves out is everything that is not the plan', () => {
  const [snapshot] = remember([], 'field', planLike(), 'p');
  assert.deepEqual(Object.keys(snapshot.plan), SNAPSHOT_KEYS);
  assert.ok(!('monthly' in snapshot.plan), 'the reading on the cards is not part of a plan');
  assert.equal(snapshot.what, 'field');
});

test('a snapshot is a photograph, not a second name for the same lists', () => {
  // The one thing that would make undo worse than nothing: a stack of
  // references to lists the app goes on editing would hand back the state it
  // was asked to take the reader away from.
  const state = planLike();
  const [snapshot] = remember([], 'strategy', state, 'p');

  state.strategies[0].fields[0].amount = '999';
  state.milestones.push({ id: 'later', metric: 'net', amount: '1' });
  state.months = 12;

  assert.equal(snapshot.plan.strategies[0].fields[0].amount, '100');
  assert.equal(snapshot.plan.milestones.length, 1);
  assert.equal(snapshot.plan.months, 240);
});

/* ----------------------------------------------------------------- the stack */

test('the stack is bounded, and it is the oldest that goes over the side', () => {
  let stack = [];
  for (let move = 0; move < MAX_UNDO + 5; move += 1) {
    stack = remember(stack, 'field', { ...planLike(), months: move }, 'p');
  }
  assert.equal(stack.length, MAX_UNDO);
  // The last ten moves, in order, with the five oldest gone: undo walks back
  // through recent work rather than to the beginning of the session.
  assert.deepEqual(stack.map((entry) => entry.plan.months), [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
});

test('nothing here edits the stack it was handed', () => {
  const state = planLike();
  const stack = remember(remember([], 'field', state, 'p'), 'reset', state, 'p');
  const before = JSON.parse(JSON.stringify(stack));

  const longer = remember(stack, 'shared', state, 'p');
  const { rest } = takeBack(stack, 'p');
  nextBack(stack, 'p');

  assert.deepEqual(stack, before, 'the original is untouched throughout');
  assert.equal(longer.length, 3);
  assert.equal(rest.length, 1);
});

test('the top is peeked at without being taken, and taken with the rest handed back', () => {
  const state = planLike();
  const stack = remember(remember([], 'field', state, 'p'), 'milestone', state, 'p');

  assert.equal(nextBack(stack, 'p').what, 'milestone', 'the control names the move it would reverse');
  assert.equal(nextBack(stack, 'p').what, 'milestone', 'and asking twice takes nothing');

  const taken = takeBack(stack, 'p');
  assert.equal(taken.snapshot.what, 'milestone');
  assert.deepEqual(taken.rest.map((entry) => entry.what), ['field']);
});

test('an empty stack has nothing to offer and nothing to give', () => {
  assert.equal(nextBack([], 'p'), null);
  assert.equal(takeBack([], 'p'), null);
  // Whatever a caller has, rather than only what a caller should have.
  assert.equal(nextBack(undefined, 'p'), null);
  assert.equal(takeBack('nonsense', 'p'), null);
});

/* ------------------------------------------------------------- and in the app */

test('every move that throws work away photographs the plan first', () => {
  /*
   * Six, not the four the gap was filed as — removing a target destroys a
   * figure somebody typed exactly the way removing a field does, and removing a
   * project destroys every plan in it. A branch that grows a `checkpoint` later
   * than its first statement would snapshot a plan that has already lost the
   * thing being taken back, so the call is held to the case as well as to being
   * present.
   */
  for (const what of UNDOABLE) {
    assert.ok(
      app.includes(`checkpoint('${what}')`) || app.includes(`checkpointShelf('${what}'`),
      `app.js checkpoints before ${what}`,
    );
  }
  // Three of the six go through the other door, and it is the three that change
  // which projects there are: removing one, starting again, and opening a link
  // as a project of its own. They are the only moves whose snapshot carries the
  // shelf, because they are the only ones whose undo has to put a record back
  // or take one away.
  assert.deepEqual(
    [...new Set([...app.matchAll(/checkpointShelf\('(\w+)'/g)].map((match) => match[1]))].sort(),
    ['project', 'reset', 'shared'],
  );
  // A set rather than the list: one of the six has two doors into it now — a
  // shared plan can be added to the project you are in or opened as one of its
  // own — and two calls for one move is not two moves.
  const taken = [...new Set([...app.matchAll(/checkpoint(?:Shelf)?\('(\w+)'/g)].map((match) => match[1]))];
  assert.deepEqual(taken.slice().sort(), UNDOABLE.slice().sort(), 'and checkpoints nothing else');
});

test('a tab adopting another window\'s plans drops its own way back first', () => {
  /*
   * The line the whole feature is most easily broken by, and the breakage is
   * silent: a backgrounded tab that keeps its snapshots is holding photographs
   * of plans the other window has since replaced, and one press of Undo writes
   * them over that window's work. Order is what makes it safe — the stack has
   * to go before the redraw that would otherwise put the button back on screen
   * offering it — so order is what is checked.
   */
  const listener = app.split("window.addEventListener('storage'")[1].split('\n});')[0];
  assert.ok(listener.includes('forgetUndo();'), 'the storage listener forgets the stack');
  assert.ok(
    listener.lastIndexOf('forgetUndo();') < listener.lastIndexOf('render();'),
    'and does it before it redraws',
  );
  assert.ok(
    listener.lastIndexOf('ui.tax.value') < listener.lastIndexOf('forgetUndo();'),
    'after the incoming plan has been taken on, so nothing is dropped for nothing',
  );
});

/* ------------------------------------------------------------------- the words */

test('every move a reader can take back can be said in every language', () => {
  // The stack holds a case rather than a sentence, so a case with no phrase is
  // a button that announces itself as `undo.aria.field` to the one reader who
  // depends on it saying anything at all.
  for (const language of LANGUAGES) {
    for (const what of UNDOABLE) {
      assert.equal(typeof STRINGS[language][`undo.aria.${what}`], 'string', `${language} names undoing ${what}`);
      assert.equal(typeof STRINGS[language][`undo.said.${what}`], 'string', `${language} says ${what} came back`);
    }
  }
});

test('nothing on screen still claims there is no undo', () => {
  /*
   * Two phrases were written when the claim was true, and undo made both of
   * them false: the question "Start again" asks, and the warning on a shared
   * plan with no room for it. What replaced them is narrower rather than
   * softer — a way back while the tab is open, and none after — which is also
   * why the question and the grave colour on its answer both stay.
   */
  for (const language of LANGUAGES) {
    const reset = STRINGS[language]['about.resetAsk'];
    const noRoom = STRINGS[language]['share.receivedNoRoom'](4);
    for (const [key, text] of [['about.resetAsk', reset], ['share.receivedNoRoom', noRoom]]) {
      assert.doesNotMatch(text, /no undo|pas de retour en arrière/i, `${language}:${key}`);
      assert.match(text, /tab is open|onglet reste ouvert/i, `${language}:${key} says how long the way back lasts`);
    }
  }
});

test('the button ships hidden, and the app bar can wrap around it', async () => {
  // It is the sixth button in a row that had five. Without the wrap it pushed
  // the whole page sideways at 320px — 34 pixels in English and 76 in French,
  // where every one of these labels is longer — and it appears at the moment
  // something has just been thrown away, which is the worst moment for the
  // page to start scrolling.
  const markup = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const button = markup.match(/<button id="undo"[^>]*>/);
  assert.ok(button, 'index.html carries the undo button');
  assert.match(button[0], /\bhidden\b/, 'and ships it hidden');
  assert.match(button[0], /data-i18n="undo\.label"/, 'named from the dictionary like every other');

  const css = await readFile(new URL('../assets/css/app.css', import.meta.url), 'utf8');
  const actions = css.split('.app-bar-actions {')[1].split('}')[0];
  assert.match(actions, /flex-wrap:\s*wrap/);
});

/* -------------------------------------------------- a snapshot names a project */

/** A shelf of three, with a plan on every record but the open one. */
const shelfLike = (open = 'p1') => ['p1', 'p2', 'p3'].map((id) => ({
  id,
  name: id.toUpperCase(),
  nameKey: '',
  plan: id === open ? null : { strategies: [], activeId: '', months: 240, milestones: [] },
}));

test('a snapshot taken in one project is not offered in another', () => {
  /*
   * The whole reason `at` exists. A photograph of the housing plans restored
   * over the car plans is not an undo — it is one question's answers written
   * over another's — so it waits until the reader is back where it was taken.
   */
  const stack = remember([], 'strategy', planLike(), 'p1');

  assert.equal(nextBack(stack, 'p1').what, 'strategy', 'offered where it was taken');
  assert.equal(nextBack(stack, 'p2'), null, 'and nowhere else');
});

test('changing subject hides the way back, and changing back returns it', () => {
  /*
   * The measured failure this replaced: emptying the stack on a switch is safe
   * and costs the reader the removal they made a moment ago. Nothing here is
   * thrown away, so a reader who looks at the car question and comes back finds
   * the field they deleted in housing still waiting to be restored.
   */
  const stack = remember([], 'field', planLike(), 'p1');
  assert.equal(nextBack(stack, 'p2'), null);
  assert.equal(nextBack(stack, 'p1').what, 'field', 'still there on the way back');
});

test('the stack holds two questions at once, each offering only its own', () => {
  let stack = remember([], 'field', planLike(), 'p1');
  stack = remember(stack, 'milestone', planLike(), 'p2');

  assert.equal(nextBack(stack, 'p1').what, 'field');
  assert.equal(nextBack(stack, 'p2').what, 'milestone');

  // Taking one back leaves the other exactly where it was, rather than taking
  // the stack with it.
  const taken = takeBack(stack, 'p1');
  assert.equal(taken.snapshot.what, 'field');
  assert.equal(taken.rest.length, 1);
  assert.equal(nextBack(taken.rest, 'p2').what, 'milestone');
});

test('a snapshot that lost a project is offered wherever the reader ends up', () => {
  // Removing a project is the one move made *to* a project rather than inside
  // one: the reader is standing somewhere else by the time it is over, so an
  // undo that waited for them to go back would wait for ever.
  const stack = remember([], 'project', planLike(), 'p3', shelfLike());
  assert.equal(nextBack(stack, 'p1').what, 'project');
  assert.equal(nextBack(stack, 'p2').what, 'project');
});

test('restoring a shelf puts back what is gone and touches nothing else', () => {
  /*
   * The line that makes carrying a shelf safe. A photograph taken before a
   * removal holds every other project as it was at that moment; writing it back
   * whole would revert whatever the reader has done in them since.
   */
  const photograph = shelfLike();
  const worked = { ...photograph[1], plan: { strategies: [], activeId: '', months: 77, milestones: [] } };
  const live = [photograph[0], worked];

  const back = restoreShelf(photograph, live);

  assert.deepEqual(back.map((project) => project.id), ['p1', 'p2', 'p3'], 'and in the order it had');
  assert.equal(back[1].plan.months, 77, 'the work done since is the work that stands');
  assert.equal(back[2].id, 'p3', 'and only the one that went comes out of the picture');
});

test('a project started since the photograph is kept, not overwritten', () => {
  const photograph = shelfLike();
  const started = { id: 'p4', name: 'New', nameKey: '', plan: { strategies: [], activeId: '', months: 12, milestones: [] } };
  const back = restoreShelf(photograph, [photograph[0], photograph[1], started]);

  assert.deepEqual(back.map((project) => project.id), ['p1', 'p2', 'p3', 'p4']);
  assert.equal(missingFrom({ shelf: photograph }, [photograph[0], started]), 2, 'two to put back');
  assert.equal(missingFrom({ at: 'p1', plan: {} }, []), 0, 'and none without a shelf');
});

test('an undo with nowhere to put a project back is not offered', () => {
  // The shelf holds six. A reader who removes one and starts another has no
  // room for the seventh, and a button that cannot do what it says is worse
  // than no button — the same rule "Start another project" follows at six.
  const stack = remember([], 'project', planLike(), 'p3', shelfLike());
  assert.equal(nextBack(stack, 'p1', () => false), null, 'no room, no offer');
  assert.equal(nextBack(stack, 'p1', () => true).what, 'project', 'room, offered');
});

test('a move that made several projects takes all of them back', () => {
  /*
   * `born` is a list rather than one id because "Start again" makes as many
   * projects as a first run does — the worked example and one per template.
   * With a single id, undoing it would put the old shelf back and leave the
   * templates it had just created sitting beside them.
   */
  const photograph = shelfLike();
  const made = ['n1', 'n2', 'n3'].map((id) => ({
    id, name: '', nameKey: '', plan: { strategies: [], activeId: '', months: 240, milestones: [] },
  }));
  const back = restoreShelf(photograph, made, made.map((project) => project.id));
  assert.deepEqual(back.map((project) => project.id), ['p1', 'p2', 'p3'], 'the shelf as it was, and nothing else');

  // And one the reader made themselves, in among them, still survives.
  const mine = { id: 'mine', name: 'Mine', nameKey: '', plan: null };
  const kept = restoreShelf(photograph, [...made, mine], made.map((project) => project.id));
  assert.deepEqual(kept.map((project) => project.id), ['p1', 'p2', 'p3', 'mine']);
});

test('an undo is weighed against the shelf it would leave, not the one it replaces', () => {
  /*
   * The bug this exists for: "Start again" builds a first run's worth of
   * projects, and the old arithmetic counted those against the ceiling as
   * though its undo would sit them *beside* the shelf coming back. With a
   * six-project ceiling and three built by the restart, the sum never fitted
   * and the Undo button simply never appeared — no message, no greyed control,
   * nothing to notice.
   */
  const photograph = shelfLike();                       // three, all gone now
  const made = ['n1', 'n2', 'n3'].map((id) => ({ id, name: '', nameKey: '', plan: null }));
  const restart = { at: 'p1', plan: {}, shelf: photograph, born: made.map((p) => p.id) };

  assert.equal(fitsAfterUndo(restart, made, 6), true, 'three back, three away: four fits');
  // Without the born list it would have read as 3 live + 3 returning = 6 > ...
  assert.equal(fitsAfterUndo({ ...restart, born: [] }, made, 5), false, 'and this is what it used to compute');

  // A removal, which makes nothing: the returning project needs real room.
  const shelved = (n) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, name: '', nameKey: '', plan: null }));
  const gone = { id: 'gone', name: '', nameKey: '', plan: null };
  // Six live, and a seventh wanting to come back.
  assert.equal(fitsAfterUndo({ at: 'gone', plan: {}, shelf: [...shelved(6), gone] }, shelved(6), 6), false,
    'a seventh does not fit');
  // Five live, and the sixth coming back.
  assert.equal(fitsAfterUndo({ at: 'gone', plan: {}, shelf: [...shelved(5), gone] }, shelved(5), 6), true,
    'with room, it does');

  // And a snapshot with no shelf at all asks for nothing.
  assert.equal(fitsAfterUndo({ at: 'p1', plan: {} }, shelved(6), 6), true);
});
