import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  MAX_UNDO, SNAPSHOT_KEYS, UNDOABLE, nextBack, remember, takeBack,
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
  assert.deepEqual(keys.map((match) => match[1]), SNAPSHOT_KEYS);
  for (const [, key, from] of keys) {
    assert.equal(key, from, `save() writes state.${from} under its own name`);
  }
});

test('what a snapshot leaves out is everything that is not the plan', () => {
  const [snapshot] = remember([], 'field', planLike());
  assert.deepEqual(Object.keys(snapshot.plan), SNAPSHOT_KEYS);
  assert.ok(!('monthly' in snapshot.plan), 'the reading on the cards is not part of a plan');
  assert.equal(snapshot.what, 'field');
});

test('a snapshot is a photograph, not a second name for the same lists', () => {
  // The one thing that would make undo worse than nothing: a stack of
  // references to lists the app goes on editing would hand back the state it
  // was asked to take the reader away from.
  const state = planLike();
  const [snapshot] = remember([], 'strategy', state);

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
    stack = remember(stack, 'field', { ...planLike(), months: move });
  }
  assert.equal(stack.length, MAX_UNDO);
  // The last ten moves, in order, with the five oldest gone: undo walks back
  // through recent work rather than to the beginning of the session.
  assert.deepEqual(stack.map((entry) => entry.plan.months), [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
});

test('nothing here edits the stack it was handed', () => {
  const state = planLike();
  const stack = remember(remember([], 'field', state), 'reset', state);
  const before = JSON.parse(JSON.stringify(stack));

  const longer = remember(stack, 'shared', state);
  const { rest } = takeBack(stack);
  nextBack(stack);

  assert.deepEqual(stack, before, 'the original is untouched throughout');
  assert.equal(longer.length, 3);
  assert.equal(rest.length, 1);
});

test('the top is peeked at without being taken, and taken with the rest handed back', () => {
  const state = planLike();
  const stack = remember(remember([], 'field', state), 'milestone', state);

  assert.equal(nextBack(stack).what, 'milestone', 'the control names the move it would reverse');
  assert.equal(nextBack(stack).what, 'milestone', 'and asking twice takes nothing');

  const taken = takeBack(stack);
  assert.equal(taken.snapshot.what, 'milestone');
  assert.deepEqual(taken.rest.map((entry) => entry.what), ['field']);
});

test('an empty stack has nothing to offer and nothing to give', () => {
  assert.equal(nextBack([]), null);
  assert.equal(takeBack([]), null);
  // Whatever a caller has, rather than only what a caller should have.
  assert.equal(nextBack(undefined), null);
  assert.equal(takeBack('nonsense'), null);
});

/* ------------------------------------------------------------- and in the app */

test('every move that throws work away photographs the plan first', () => {
  /*
   * Five, not the four the gap was filed as — removing a target destroys a
   * figure somebody typed exactly the way removing a field does. A branch that
   * grows a `checkpoint` later than its first statement would snapshot a plan
   * that has already lost the thing being taken back, so the call is held to
   * the case as well as to being present.
   */
  for (const what of UNDOABLE) {
    assert.ok(app.includes(`checkpoint('${what}')`), `app.js checkpoints before ${what}`);
  }
  const taken = [...app.matchAll(/checkpoint\('(\w+)'\)/g)].map((match) => match[1]);
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
