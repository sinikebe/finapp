import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  MAX_PROJECTS, MAX_NAME_LENGTH, PROJECT_KEYS, normalizeProject, normalizeProjects,
  normalizePlan, openIdOf, moveOpen, parkOpen, planOf, nameOf,
  addProject, updateProject, removeProject, neighbourOf,
} from '../assets/js/projects.js';
import { normalizeMilestones } from '../assets/js/milestones.js';
import { normalizeFields } from '../assets/js/fields.js';
import { schedule } from '../assets/js/schedule.js';
import { project as run } from '../assets/js/projection.js';

const METRICS = ['net', 'worth', 'income', 'expenses', 'invested', 'profit', 'owned', 'debt'];
const coerce = {
  months: (value) => Math.min(600, Math.max(1, Math.trunc(Number(value)) || 240)),
  milestones: (value) => normalizeMilestones(value, METRICS),
};
const t = (key) => key;

const stateLike = (over = {}) => ({
  strategies: [{ id: 's', name: 'Mine', fields: [] }],
  activeId: 's',
  months: 240,
  milestones: [],
  inflation: '2',
  tax: '30',
  ...over,
});

/* ------------------------------------------------------------- the boundary */

test('a project holds the question, and nothing about the world', () => {
  /*
   * The scoping, stated as a shape rather than as a comment. The five
   * assumptions are absent from a project on purpose: inflation and tax are a
   * belief about the world, not about the question, and a reader who thinks
   * inflation is 3% thinks so on both sides of the car decision and the house
   * one. Two copies would only let one belief quietly disagree with itself, in
   * a panel that is folded shut by default.
   */
  assert.deepEqual(PROJECT_KEYS, ['strategies', 'activeId', 'months', 'milestones']);
  const plan = planOf(stateLike());
  assert.deepEqual(Object.keys(plan), PROJECT_KEYS);
  for (const belief of ['inflation', 'realMoney', 'spread', 'showRange', 'tax']) {
    assert.ok(!(belief in plan), `${belief} is the world's, not the project's`);
  }
});

test('the horizon is in because it decides which fields exist', () => {
  /*
   * The proof that the line is drawn by the model rather than by taste, and the
   * reason `months` could not have been left global beside inflation.
   *
   * A purchase waiting on "when what I own reaches 12,000" is placed by
   * `schedule.js` off a projection run over `months`. Read the same plan over
   * six months and the target is never met, so the purchase is not in the plan
   * at all — a number that changes which rows are on the chart is part of the
   * question being asked. Inflation changes what every row is *worth*, in the
   * same way, in every question on the device.
   */
  const fields = normalizeFields([
    { id: 'f1', kind: 'plain', direction: 'income', amount: '3000' },
    { id: 'f2', kind: 'once', direction: 'expense', amount: '500', startAt: 'm1' },
  ]);
  const milestones = normalizeMilestones([{ id: 'm1', metric: 'worth', amount: '12000' }], METRICS);
  const read = (value) => Number(String(value).replace(',', '.')) || 0;
  const over = (months) => schedule({
    fields,
    milestones,
    run: (list) => run({ fields: list, months, inflation: 0, spread: 0, tax: 0 }),
    read,
  }).fields.length;

  assert.equal(over(2), 1, 'over two months the target is never met and the purchase is not there');
  assert.equal(over(12), 2, 'over a year it is');
  assert.equal(over(60), 2, 'and over five');
});

test('the targets are in because a field waits on one by id', () => {
  /*
   * The other half of the same argument, and the one `schedule.js` decides.
   * A field holds a target's id, and a field whose target is not in the list
   * beside it is dropped from the projection with nothing on screen saying so.
   * Per project, a field and the target it waits on are always in the same
   * list — which is the only scoping under which `schedule.js` stays sound
   * without a line changing in it, and not a line did.
   */
  const fields = normalizeFields([
    { id: 'f1', kind: 'plain', direction: 'income', amount: '3000' },
    { id: 'f2', kind: 'once', direction: 'expense', amount: '500', startAt: 'm1' },
  ]);
  const read = (value) => Number(String(value).replace(',', '.')) || 0;
  const placed = (milestones) => schedule({
    fields,
    milestones,
    run: (list) => run({ fields: list, months: 120, inflation: 0, spread: 0, tax: 0 }),
    read,
  }).fields.length;

  assert.equal(placed(normalizeMilestones([{ id: 'm1', metric: 'worth', amount: '12000' }], METRICS)), 2);
  assert.equal(placed([]), 1, 'a target out of scope takes its field with it, silently');
});

/* ------------------------------------------------------------ the one copy */

test('the open project carries no plan, and it is the only one that does not', () => {
  /*
   * The invariant the store rests on. One copy of the plan on screen means the
   * two halves of the store cannot disagree about it, and it means an older
   * build's write into `finapp.state.v3` is simply the truth rather than
   * something to be reconciled against a second copy that might be fresher.
   */
  const projects = normalizeProjects([
    { id: 'a', plan: { months: 60 } },
    { id: 'b', plan: { months: 240 } },
  ], coerce, 'b');

  assert.equal(projects.find((p) => p.id === 'b').plan, null, 'the open one is the flat store');
  assert.equal(projects.find((p) => p.id === 'a').plan.months, 60, 'every other one holds its own');
  assert.equal(projects.filter((p) => p.plan === null).length, 1, 'exactly one, always');
});

test('a shelf that names nobody opens the first, still with one copy', () => {
  const projects = normalizeProjects([{ id: 'a' }, { id: 'b' }], coerce, 'gone');
  assert.equal(projects[0].plan, null);
  assert.equal(projects.filter((p) => p.plan === null).length, 1);
  assert.equal(openIdOf(projects, 'gone'), 'a');
});

test('switching moves the plan across in one expression', () => {
  const projects = normalizeProjects([
    { id: 'a' },
    { id: 'b', plan: { months: 60, strategies: [{ id: 'x', name: 'Rent' }] } },
  ], coerce, 'a');
  const moved = moveOpen(projects, 'a', 'b', stateLike({ months: 240 }));

  assert.equal(moved.plan.months, 60, 'the arriving project puts its own horizon up');
  assert.equal(moved.projects.find((p) => p.id === 'b').plan, null, 'and stops holding a copy');
  assert.equal(moved.projects.find((p) => p.id === 'a').plan.months, 240, 'as the one left takes one');
  assert.equal(moved.projects.filter((p) => p.plan === null).length, 1);
});

test('parking leaves the plan where the shelf can be read or photographed', () => {
  const projects = normalizeProjects([{ id: 'a' }, { id: 'b' }], coerce, 'a');
  const parked = parkOpen(projects, 'a', stateLike({ months: 96 }));
  assert.equal(parked.find((p) => p.id === 'a').plan.months, 96);
  assert.deepEqual(Object.keys(parked.find((p) => p.id === 'a').plan), PROJECT_KEYS);
});

/* ------------------------------------------------------------------ naming */

test('a lone unnamed project is called what the panel has always been called', () => {
  /*
   * The whole of the migration on screen. A store written before projects
   * existed becomes one unnamed project, and one unnamed project is not
   * "Project 1" — it is the words that were already above the form. Nothing has
   * appeared to be named, because nothing has.
   */
  const only = normalizeProject({}, coerce, true);
  assert.equal(nameOf(only, 0, 1, t), 'inputs.heading');
  assert.equal(nameOf(only, 0, 2, t), 'project.defaultName', 'once there are two, it needs a name');
  assert.equal(nameOf({ ...only, name: 'The car' }, 0, 2, t), 'The car');
  assert.equal(nameOf({ ...only, nameKey: 'project.default.home' }, 0, 1, t), 'inputs.heading',
    'a key nothing translates falls through rather than showing itself');
});

test('a name is trimmed, bounded, and never invented', () => {
  const long = normalizeProject({ name: `  ${'x'.repeat(80)}  ` }, coerce, true);
  assert.equal(long.name.length, MAX_NAME_LENGTH);
  assert.equal(normalizeProject({ name: 42 }, coerce, true).name, '');
  assert.equal(normalizeProject({ nameKey: 'strategy.default.loan' }, coerce, true).nameKey, '',
    'a key from another list is not a project name');
  assert.equal(normalizeProject({ nameKey: 'project.default.home' }, coerce, true).nameKey,
    'project.default.home');
});

/* -------------------------------------------------------------- operations */

test('the shelf is bounded, and the last project never leaves', () => {
  let projects = normalizeProjects([{ id: 'a' }], coerce, 'a');
  for (let more = 0; more < MAX_PROJECTS + 3; more += 1) {
    projects = addProject(projects, normalizeProject({}, coerce, false));
  }
  assert.equal(projects.length, MAX_PROJECTS);

  let one = normalizeProjects([{ id: 'a' }], coerce, 'a');
  assert.equal(removeProject(one, 'a').length, 1, 'there is always something on screen');
  one = normalizeProjects([{ id: 'a' }, { id: 'b' }], coerce, 'a');
  assert.deepEqual(removeProject(one, 'a').map((p) => p.id), ['b']);
});

test('the neighbour is the next, else the previous', () => {
  const projects = normalizeProjects([{ id: 'a' }, { id: 'b' }, { id: 'c' }], coerce, 'a');
  assert.equal(neighbourOf(projects, 'a'), 'b');
  assert.equal(neighbourOf(projects, 'c'), 'b');
  assert.equal(neighbourOf(projects, 'gone'), 'a');
});

test('an update cannot change an id, and cannot smuggle a longer name', () => {
  const projects = normalizeProjects([{ id: 'a' }, { id: 'b' }], coerce, 'a');
  const next = updateProject(projects, 'a', { id: 'hijacked', name: 'y'.repeat(100) });
  assert.equal(next[0].id, 'a');
  assert.equal(next[0].name.length, MAX_NAME_LENGTH);
  assert.equal(next[1].name, projects[1].name, 'and leaves everybody else alone');
});

test('duplicate ids are made unique rather than silently merged', () => {
  const projects = normalizeProjects([{ id: 'a' }, { id: 'a' }], coerce, 'a');
  assert.notEqual(projects[0].id, projects[1].id);
  assert.equal(projects.filter((p) => p.plan === null).length, 1);
});

test('nonsense becomes one empty project rather than nothing at all', () => {
  for (const nonsense of [null, undefined, 'x', 42, {}, []]) {
    const projects = normalizeProjects(nonsense, coerce, '');
    assert.equal(projects.length, 1);
    assert.equal(projects[0].plan, null);
    assert.equal(projects[0].name, '');
  }
  const plan = normalizePlan('nonsense', coerce);
  assert.deepEqual(Object.keys(plan), PROJECT_KEYS);
  assert.equal(plan.strategies.length, 1, 'a project always has a plan to look at');
});

/* ------------------------------------------------------------- and the store */

test('the shelf is never written into the store an older build rewrites', async () => {
  /*
   * Measured before this shape was chosen: a build from before projects writes
   * a fresh nine-key literal into `finapp.state.v3` on the first keystroke and
   * drops everything it does not know. Put the shelf in that key and one
   * keystroke in a stale tab — a PWA left open, a service worker generation
   * that only *offers* a reload — takes every project with it, silently and
   * irrecoverably. Under its own key, no older build ever writes it.
   */
  const app = await readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  const stateKey = app.match(/const STATE_KEY = '([^']+)'/)[1];
  const projectsKey = app.match(/const PROJECTS_KEY = '([^']+)'/)[1];
  assert.equal(stateKey, 'finapp.state.v3', 'the store an older build knows keeps its key');
  assert.notEqual(projectsKey, stateKey);

  // And what goes in the old key is the nine it always held, plus a stamp: a
  // string an older build reads past and drops, which is exactly the case
  // `loadProjects` branch 3 exists to adopt.
  const written = app.split('function save() {')[1].split('writeStore(STATE_KEY, {')[1].split('});')[0];
  assert.ok(written.includes('projectId: state.openProjectId'));
  assert.ok(!written.includes('projects:'), 'the shelf itself is not in there');
});
