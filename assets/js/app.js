/**
 * app.js — wiring. Holds the reader's fields and horizon, runs the projection,
 * pushes it into three charts that share one scale, and keeps the whole thing
 * usable offline.
 *
 * The app knows nothing about "income" and "rent" as such: they are two
 * ordinary fields the reader can rename, retype, duplicate or delete like any
 * other. Everything here works from the list, never from a named field.
 */

import { createSaveController } from './save-controller.js';
import { deploymentFor, scopedStorage } from './deployment.js';
import { createInterfaceView } from './interface-view.js';
import { bindNumericInput } from './input-validation.js';
import { VIEW_MODE_KEY, INTRO_KEY, viewModeOf, guidedPlan } from './interface.js';
import { annualPercent } from './numbers.js';
import { project, runsDryAt, shiftReturns, seriesOf, monthlyOf, extentOf, hasAmounts, hasDebt, hasOwned, monthlyRate, toAmount, toMonths, fieldTotalOf, loanPartsOf, shareOut, toNumber, toRateNumber, moversOf, swingOf, orderBySwing } from './projection.js';
import { addField, updateField, duplicateField, removeField, neighbourOf, labelOf } from './fields.js';
import { formatAmount, formatCompact, formatMonth, formatHorizon, formatRate, formatTyped, setFormatLocale, setDisplayCurrency } from './format.js';
import { html } from './dom.js';
import { createLineChart, endLabelPad } from './chart.js';
import { createSankey } from './sankey.js';
import { labelsForFields } from './field-labels.js';
import { createFieldList } from './field-list.js';
import { createMilestoneList } from './milestone-list.js';
import { addMilestone, updateMilestone, neighbourOf as milestoneNeighbourOf, normalizeMilestones, whenMet } from './milestones.js';
import { candidatesOf, solveFor } from './solve.js';
import { createStrategyBar, createStrategyJump } from './strategy-bar.js';
import { updateStrategy, duplicateStrategy, removeStrategy, spreadField, unlinkField, removeEverywhere, neighbourOf as strategyNeighbourOf, activeIdOf, nameOf, markShared, MAX_STRATEGIES } from './strategies.js';
import { MAX_PROJECTS, normalizeProject, normalizePlan, openIdOf, moveOpen, parkOpen, planOf, addProject, updateProject, removeProject, neighbourOf as projectNeighbourOf, nameOf as projectNameOf } from './projects.js';
import { createProjectSwitch, createProjectList } from './project-switch.js';
import { templateOf } from './templates.js';
import { createScenarioRunner } from './scenarios.js';
import { referencesTo, missingTargets, settleTargetPatch, removeTarget, mergeSharedPlan } from './plan-operations.js';
import { decodePlan, linkFor, planInHash } from './share.js';
import { remember, takeBack, nextBack, restoreShelf, fitsAfterUndo } from './history.js';
import { LANGUAGES, detectLanguage, localeFor, makeTranslator } from './i18n.js';
import { createPlanStore, readValue, writeValue, STORE_KEYS } from './store.js';
import { loadWorkspace, snapshotOf, defaultState, firstRunProjects, projectCoerce, toRateText, DEFAULT_MONTHS, DEFAULT_SPREAD, DEFAULT_TAX, METRICS } from './state.js';
import { BUILD } from './version.js';
import { RELEASES } from './changelog.js';

const THEME_KEY = 'finapp.theme.v1';
const UPDATE_CHECKED_KEY = 'finapp.updateChecked.v1';
const LANG_KEY = 'finapp.language.v1';
const THEME_ORDER = ['auto', 'light', 'dark'];
const THEME_COLORS = { light: '#f9f9f7', dark: '#0d0d0d' };
const BAND_KEYS = new Set(['invested', 'worth']);

const $ = (id) => document.getElementById(id);

const ui = {
  saveStatus: $('save-status'),
  saveMessage: $('save-message'),
  saveRetry: $('save-retry'),
  saveLatest: $('save-latest'),
  saveExport: $('save-export'),
  saveRecover: $('save-recover'),
  aboutBackup: $('about-backup'),
  undo: $('undo'),
  undoSaid: $('undo-said'),
  fields: $('fields'),
  strategies: $('strategies'),
  inputsHeading: $('inputs-heading'),
  projectsDialog: $('projects'),
  projectsClose: $('projects-close'),
  projectMount: $('project-mount'),
  railToggle: $('rail-toggle'),
  inputsBody: $('inputs-body'),
  strategyJump: $('strategy-jump'),
  sankey: $('sankey'),
  sankeyMount: $('sankey-mount'),
  compare: $('compare'),
  compareNote: $('compare-note'),
  compareMetrics: $('compare-metrics'),
  compareChart: $('compare-chart'),
  compareCaption: $('compare-table-caption'),
  compareHead: $('compare-head'),
  compareBody: $('compare-body'),
  rank: $('rank'),
  rankNote: $('rank-note'),
  rankList: $('rank-list'),
  rankSaid: $('rank-said'),
  milestones: $('milestones'),
  milestoneMount: $('milestone-mount'),
  addMilestone: $('add-milestone'),
  goalCaveat: $('goal-caveat'),
  months: $('months'),
  monthsReadout: $('months-readout'),
  // Selected by what makes one a horizon preset — the months it sets — not by
  // the chip styling, which the money toggle and the comparison chips share.
  presets: Array.from(document.querySelectorAll('.preset[data-months]')),
  heroLabel: $('hero-label'),
  heroValue: $('hero-value'),
  heroChip: $('hero-chip'),
  heroChipText: $('hero-chip-text'),
  chipIconPath: $('chip-icon-path'),
  totalIncome: $('total-income'),
  totalExpenses: $('total-expenses'),
  monthlyNet: $('monthly-net'),
  investedTile: $('invested-tile'),
  investedValue: $('invested-value'),
  ownedTile: $('owned-tile'),
  ownedValue: $('owned-value'),
  debtTile: $('debt-tile'),
  debtValue: $('debt-value'),
  debtHint: $('debt-hint'),
  syncHint: $('sync-hint'),
  windowNote: $('window-note'),
  realToggle: $('real-toggle'),
  inflationFilter: $('inflation-filter'),
  inflation: $('inflation'),
  moneyNote: $('money-note'),
  rangeToggle: $('range-toggle'),
  spreadFilter: $('spread-filter'),
  spread: $('spread'),
  taxFilter: $('tax-filter'),
  taxScope: $('tax-scope'),
  tax: $('tax'),
  contributedTile: $('contributed-tile'),
  contributedValue: $('contributed-value'),
  profitTile: $('profit-tile'),
  profitLabel: $('profit-label'),
  profitValue: $('profit-value'),
  worthTile: $('worth-tile'),
  worthLabel: $('worth-label'),
  worthValue: $('worth-value'),
  chartsNote: $('charts-note'),
  chartsHeading: $('charts-heading'),
  chartsScaleNote: $('charts-scale-note'),
  viewTotal: $('view-total'),
  viewMonthly: $('view-monthly'),
  periodNote: $('period-note'),
  charts: $('charts'),
  summary: document.querySelector('.summary'),
  themeButton: $('theme'),
  themeLabel: $('theme-label'),
  langButton: $('lang'),
  langLabel: $('lang-label'),
  themeColor: $('theme-color'),
  description: $('doc-description'),
  manifestLink: $('manifest-link'),
  installButton: $('install'),
  aboutDialog: $('about'),
  aboutOpen: $('about-open'),
  aboutClose: $('about-close'),
  aboutVersion: $('about-version'),
  aboutBranch: $('about-branch'),
  aboutCommit: $('about-commit'),
  aboutDate: $('about-date'),
  aboutLog: $('about-log'),
  aboutUpdate: $('about-update'),
  aboutUpdateRow: $('about-update-row'),
  aboutUpdateNote: $('about-update-note'),
  aboutReset: $('about-reset'),
  aboutResetRow: $('about-reset-row'),
  aboutConfirm: $('about-confirm'),
  aboutResetYes: $('about-reset-yes'),
  aboutResetNo: $('about-reset-no'),
  shareOpen: $('share-open'),
  shareDialog: $('share'),
  shareClose: $('share-close'),
  shareLink: $('share-link'),
  shareCopy: $('share-copy'),
  shareSaid: $('share-said'),
  sharedDialog: $('shared'),
  sharedHeading: $('shared-heading'),
  milestoneUnsettled: $('milestone-unsettled'),
  milestoneInvalid: $('milestone-invalid'),
  sharedWhat: $('shared-what'),
  sharedRoom: $('shared-room'),
  sharedAsk: $('shared-ask'),
  sharedNew: $('shared-new'),
  sharedOpen: $('shared-open'),
  sharedKeep: $('shared-keep'),
  updateToast: $('update-toast'),
  updateReload: $('update-reload'),
};

const STATUS_ICONS = {
  // Both status cues ship as icon + label, never colour alone.
  surplus: 'M4.5 10.5 8 6.5l3.5 4z',
  shortfall: 'M8 3.2v6.2M8 12v.4',
};

/* ------------------------------------------------------------------ storage */

const deployment = deploymentFor(new URL('../../', import.meta.url));
const scoped = scopedStorage(() => window.localStorage, deployment.prefix);
const storage = scoped.storage;
const readStore = (key, fallback) => readValue(storage, key, fallback);
const writeStore = (key, value) => writeValue(storage, key, value);

function resolveLanguage() {
  const saved = readStore(LANG_KEY, null);
  return LANGUAGES.includes(saved) ? saved : detectLanguage();
}

/* -------------------------------------------------------------------- state */

const planStore = createPlanStore(storage, {
  // A document gets its own draft key. Duplicated tabs copy sessionStorage,
  // so a session-stored id would let two live tabs overwrite each other's draft.
  withLock: navigator.locks ? (work) => navigator.locks.request(scoped.physical('finapp.workspace'), work) : null,
});
const loaded = planStore.read();
const freshWorkspace = !loaded.data.flat && !loaded.data.shelf && !loaded.data.legacyFields && !loaded.data.legacyInputs;
const state = loadWorkspace(loaded.data, resolveLanguage());
let viewMode = viewModeOf(readStore(VIEW_MODE_KEY, 'simple'));
let simpleMetric = 'net';
let advancedMonthly = false;
let introPending = freshWorkspace && !readStore(INTRO_KEY, false);
const invalidInputs = new Set();
const assumptionInputs = [];
setDisplayCurrency(readStore('finapp.currency.v1', ''));
document.body.dataset.mode = viewMode;
$('preview-banner').hidden = !deployment.preview;
const saver = createSaveController({
  store: planStore, snapshot: () => snapshotOf(state), initial: loaded,
  initialBaseline: freshWorkspace ? '' : JSON.stringify(snapshotOf(state)),
  adopt: adoptWorkspace,
  editing: () => document.activeElement instanceof Element && Boolean(document.activeElement.closest('.field-list, .strategy-bar, .filter-row, .milestone-list, .project-list, .horizon')),
  notify: paintSaveStatus,
});

/** The open project's record. */
function openProject() {
  return state.projects.find((project) => project.id === state.openProjectId) || state.projects[0];
}

/** The strategy being edited, and where it sits in the bar. */
function activeIndex() {
  const index = state.strategies.findIndex((strategy) => strategy.id === state.activeId);
  return index === -1 ? 0 : index;
}

function activeStrategy() {
  return state.strategies[activeIndex()];
}

/** The fields on screen: the active strategy's. */
function fields() {
  return activeStrategy().fields;
}

/** Field edits always land on the strategy on screen. */
function setActiveFields(next) {
  state.strategies = updateStrategy(state.strategies, state.activeId, { fields: next });
}

function inputValidity(key, invalid) {
  if (invalid) invalidInputs.add(key); else invalidInputs.delete(key);
  $('input-warning').hidden = invalidInputs.size === 0;
}

function paintSaveStatus() {
  const { state: saveState, recoveries, saving } = saver.status();
  const problem = !['saved', 'pending'].includes(saveState);
  ui.saveStatus.hidden = !problem && !recoveries.length;
  const message = t(problem ? `save.${saveState}` : 'save.recovery', recoveries.length);
  if (ui.saveMessage.textContent !== message) ui.saveMessage.textContent = message;
  const indicator = t(saveState === 'pending' ? 'ui.unsaved' : saveState === 'saved' ? 'ui.saved' : `save.${saveState}`);
  if ($('save-indicator').textContent !== indicator) $('save-indicator').textContent = indicator;
  ui.saveRetry.hidden = !['error', 'unavailable'].includes(saveState);
  ui.saveLatest.hidden = !['conflict', 'remote'].includes(saveState);
  ui.saveLatest.disabled = saving;
  ui.saveRecover.disabled = saving;
  ui.saveRecover.hidden = !recoveries.length;
}

const stageChanges = () => saver.stage();
const save = () => saver.save();
const persist = () => saver.persist();
const receiveSaved = () => saver.receive();

function adoptWorkspace(snapshot) {
  list.clearDrafts(); milestoneList.clearDrafts(); interfaceView.clearDrafts();
  for (const input of assumptionInputs) input.clear();
  invalidInputs.clear(); $('input-warning').hidden = true;
  Object.assign(state, loadWorkspace(snapshot, language));
  forgetUndo(); forgetRanking(); forgetAsked();
  metricChosen = false;
  fillControls(); render();
}

window.addEventListener('storage', (event) => {
  const key = scoped.logical(event.key);
  if (key === null || STORE_KEYS.includes(key)) receiveSaved();
});
document.addEventListener('focusout', () => { if (saver.status().pendingRemote) window.setTimeout(receiveSaved, 0); });
for (const event of ['pagehide', 'beforeunload']) window.addEventListener(event, () => { if (saver.status().dirty || saver.status().saving) { stageChanges(); save(); } });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saver.status().dirty) { stageChanges(); save(); }
  if (document.visibilityState === 'visible') receiveSaved();
});
window.addEventListener('focus', receiveSaved);
ui.saveRetry.addEventListener('click', save);
ui.saveLatest.addEventListener('click', () => {
  if (saver.status().dirty && !window.confirm(t('save.discardAsk'))) return;
  saver.loadLatest();
});
ui.saveExport.addEventListener('click', exportBackup);
ui.aboutBackup.addEventListener('click', exportBackup);
$('backup-download').addEventListener('click', exportBackup);
ui.saveRecover.addEventListener('click', async () => {
  const recovery = planStore.drafts()[0];
  if (!recovery || !window.confirm(t('save.recoverAsk'))) return;
  if (!planStore.keepRecovery(snapshotOf(state))) { window.alert(t('ui.restoreSafety')); return; }
  const result = await saver.replace(recovery.snapshot);
  if (result.status === 'saved' && !saver.status().dirty) planStore.discardDraft(recovery.key);
  paintSaveStatus();
});

function exportBackup() {
  const contents = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), workspace: snapshotOf(state), drafts: planStore.drafts() }, null, 2);
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `finapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* --------------------------------------------------------------------- undo */

let undoStack = [];

/**
 * Which of the five the last press put back, or '' while there is nothing to
 * say.
 *
 * The case rather than the sentence, for the reason a solved figure is kept as
 * a finding rather than as words: the wording follows the language and the case
 * does not, so a reader who switches language with the line on screen gets it
 * in the other one instead of a phrase left standing in English.
 */
let undone = '';
let undoSaidTimer = 0;

/**
 * How long the receipt stays in the app bar.
 *
 * Long enough to read a sentence, short enough that the header is not still
 * explaining something from a minute ago. It is a `role="status"`, so it has
 * been announced by the time it goes — what is being timed out is the line on
 * screen, not the announcement.
 */
const UNDO_SAID_MS = 6000;

/** Take the receipt down, whether it has timed out or been overtaken. */
function clearUndoSaid() {
  window.clearTimeout(undoSaidTimer);
  undoSaidTimer = 0;
  undone = '';
  ui.undoSaid.hidden = true;
  ui.undoSaid.textContent = '';
}

/** Photograph the plan, before the caller takes a piece of it away. */
function checkpoint(what) {
  undoStack = remember(undoStack, what, state, state.openProjectId);
  // Something new to take back makes the last receipt out of date: it is still
  // true that the field came back, and it is no longer what just happened.
  clearUndoSaid();
}

function roomToUndo(snapshot) {
  // The projects the move itself made do not count against the ceiling, because
  // taking the move back takes them away in the same breath. Without this,
  // undoing "Start again" was offered only while the shelf it had just built
  // was small enough to sit *beside* the one it replaced — which since a first
  // run builds three projects rather than one, it never was. The button simply
  // did not appear, which is the worst way for an undo to be unavailable.
  return fitsAfterUndo(snapshot, state.projects, MAX_PROJECTS);
}

/**
 * Photograph a project the reader is about to lose, rather than the one they
 * are standing in.
 *
 * The two moves that throw a project away are the only ones where those differ,
 * and they are the only ones that need the shelf as well — everything else
 * leaves it alone, so photographing it would be storing a copy of work still
 * being done in order to write it back later.
 *
 * @param {string} what `'project'` or `'reset'`
 * @param {object} plan the four keys of the project the snapshot is about
 * @param {string} at the id of the project that is
 * @param {Array<string>} [born] the projects this move is about to create,
 *   which its undo has to take away again
 */
function checkpointShelf(what, plan, at, born) {
  // Parked, so that every record in a photograph carries a plan — including the
  // open one, whose plan is the live state rather than anything on the shelf.
  const shelf = parkOpen(state.projects, state.openProjectId, state);
  undoStack = remember(undoStack, what, { ...state, ...plan }, at, shelf, born);
  clearUndoSaid();
}

function forgetUndo() {
  undoStack = [];
  clearUndoSaid();
}

function undo() {
  const taken = takeBack(undoStack, state.openProjectId, roomToUndo);
  if (!taken) return;
  // Asked before the redraw, because the redraw is what takes the button away.
  const held = document.activeElement === ui.undo;
  undoStack = taken.rest;
  const { snapshot } = taken;
  // Whatever is on screen belongs to the project on screen, and the snapshot may
  // be about a different one — so park it before the shelf is rearranged under
  // it. For the ordinary case the two are the same project and this writes back
  // what was already there.
  state.projects = parkOpen(state.projects, state.openProjectId, state);
  // A snapshot carrying a shelf is one of the two moves that lost a project.
  // `restoreShelf` puts back only what is missing: every project that still
  // exists keeps the plan it has now, so undoing a removal cannot revert work
  // done elsewhere since.
  if (snapshot.shelf) state.projects = restoreShelf(snapshot.shelf, state.projects, snapshot.born);
  // The nine keys are the photograph of `at`, so they go on screen and the
  // reader goes with them — a plan restored off screen reads as a button that
  // did nothing. The five assumptions in them are global and are written back
  // whichever project this was, because two of the six moves change them.
  state.openProjectId = openIdOf(state.projects, snapshot.at);
  Object.assign(state, snapshot.plan);
  state.projects = state.projects.map(
    (project) => (project.id === state.openProjectId ? { ...project, plan: null } : project),
  );
  // The kept ranking and the kept answer are both about the plan that was on
  // screen a moment ago. Each is held against a question it can be checked
  // against, so a stale one would only ever be recomputed rather than shown —
  // but the plan has just been replaced wholesale, and there is nothing to be
  // gained by carrying an answer to a question nobody is asking any more.
  forgetRanking();
  forgetAsked();
  window.clearTimeout(undoSaidTimer);
  undone = taken.snapshot.what;
  undoSaidTimer = window.setTimeout(clearUndoSaid, UNDO_SAID_MS);
  fillControls();
  save();
  render();
  // Taking back the last move hides the button that took it, and setting
  // `hidden` on the focused element drops focus to the document — which would
  // leave a keyboard reader tabbing from the top of the page to find out what
  // happened. So it lands on the line that replaced it, which is the line
  // saying what came back. A screen reader hears that twice, once as a live
  // region and once on the focus; twice is the smaller of the two costs.
  if (held && ui.undo.hidden) ui.undoSaid.focus();
}

/**
 * The control, drawn from the top of the stack.
 *
 * Gone entirely while there is nothing to take back, rather than sitting there
 * greyed: a permanently disabled button is a promise the app is not keeping,
 * and this one has nothing to say for itself between removals.
 */
function renderUndo() {
  const next = nextBack(undoStack, state.openProjectId, roomToUndo);
  ui.undo.hidden = !next;
  // The word on the button is "Undo" in every case; which of the five it would
  // reverse is in the accessible name, where a reader who cannot see what just
  // happened to the page is the one who needs it.
  if (next) ui.undo.setAttribute('aria-label', t(`undo.aria.${next.what}`));
  ui.undoSaid.hidden = !undone;
  // Written only when it has actually moved, which matters here and nowhere
  // else on the page: this is a live region, `render()` runs on every keystroke,
  // and writing the same sentence back into it is still a DOM change — so a
  // reader who undid something and then carried on typing would have had it
  // read out at them again on every letter.
  const said = undone ? t(`undo.said.${undone}`) : '';
  if (ui.undoSaid.textContent !== said) ui.undoSaid.textContent = said;
}

ui.undo.addEventListener('click', undo);

/* ------------------------------------------------------------------- charts */

function investsInside(projection) {
  return projection.totals.contributed > 0 || projection.totals.invested > 0;
}

const CHARTS = [
  { id: 'chart-income', key: 'income', colorVar: '--series-income' },
  { id: 'chart-expenses', key: 'expenses', colorVar: '--series-expenses' },
  { id: 'chart-net', key: 'net', colorVar: '--series-net' },
  // Each of these is drawn only once it has something to say. Without an
  // investment, a debt or a thing owned, the total is the net to the cent, and
  // a card that restates the one beside it is a question nobody asked.
  {
    id: 'chart-worth',
    key: 'worth',
    colorVar: '--series-worth',
    when: (projection) => investsInside(projection) || hasDebt(projection) || hasOwned(projection),
    // Deliberately on the flows' shared scale rather than its own: the whole
    // point of the card is the gap between the total and the net beside it,
    // which is what the investments have added. Its own scale would hide it.
  },
  {
    id: 'chart-invested',
    key: 'invested',
    colorVar: '--series-invested',
    when: investsInside,
    // Drawn against what was actually paid in: the gap between the two lines
    // is the gain, which is the only reason anyone holds the thing.
    reference: 'contributed',
    // A balance is not a cumulative flow: put it on the flows' scale and a
    // realistic pot reads as a flat line along the axis. Its own scale makes it
    // readable, and the note under the charts says which card is on its own.
    ownScale: true,
  },
];

let charts = [];

/**
 * Whether the cards are read a month at a time rather than as running totals.
 *
 * Module state, not stored state: it is a way of looking at a plan rather than
 * anything about the plan, so it never goes in the store, never travels in a
 * shared link, and a reload opens on the running total the heading names.
 */
let monthly = false;

/**
 * Say something else on a node the language loop also writes to.
 *
 * The key moves with the text. `applyLanguage` relabels every `[data-i18n]`
 * node from whatever the attribute says, so a node whose key has moved is
 * carried into the other language on its own — where writing only the text
 * would leave the loop putting the phrase for the other reading back.
 */
function sayInstead(node, key) {
  node.dataset.i18n = key;
  node.textContent = t(key);
}

function ownScaleOf(spec) {
  return Boolean(spec.ownScale) && !monthly;
}

function activeCharts(projection) {
  return CHARTS.filter((spec) => viewMode === 'simple' ? spec.key === simpleMetric : !spec.when || spec.when(projection));
}

/**
 * One of a card's phrases, in the reading on screen.
 *
 * The per-month wording lives under the card's own key rather than in a
 * dictionary of its own, so a card that learns a new word learns it for both
 * readings in one place, and the key set says outright which cards have two.
 */
function chartWord(key, part) {
  return t(monthly ? `chart.${key}.monthly.${part}` : `chart.${key}.${part}`);
}

/** Every word a card owns, in the language and the reading of the moment. */
function chartWords(spec) {
  const title = chartWord(spec.key, 'title');
  return {
    title,
    description: chartWord(spec.key, 'description'),
    labels: {
      showTable: t('chart.showTable'),
      hideTable: t('chart.hideTable'),
      tableCaption: t(monthly ? 'chart.monthlyCaption' : 'chart.tableCaption', title),
      monthColumn: t('chart.monthColumn'),
      ariaLabel: (months, endValue, count) => t('chart.aria', title, months, endValue, count),
      reading: (month, value) => t('chart.reading', month, value),
      seriesReading: (label, value) => t('chart.seriesReading', label, value),
    },
  };
}

function syncCharts(specs) {
  const wanted = new Set(specs.map((spec) => spec.id));
  for (const chart of charts) {
    if (!wanted.has(chart.id)) chart.instance.destroy();
  }
  const standing = new Map(charts.map((chart) => [chart.id, chart]));
  charts = specs.map((spec) => standing.get(spec.id) || {
    ...spec,
    instance: createLineChart({
      mount: ui.charts,
      id: spec.id,
      ...chartWords(spec),
      formatValue: formatAmount,
      formatTick: formatCompact,
      formatMonth: (month) => formatMonth(month, t),
      onHover: (index) => {
        for (const chart of charts) chart.instance.setActive(index);
      },
    }),
  });
  // Whatever order they were made in, they end up in the order `specs` asks
  // for: appending a node already in the list moves it rather than copying it.
  for (const chart of charts) { chart.instance.element.dataset.metric = chart.key; ui.charts.appendChild(chart.instance.element); }
}

/** Which reading the standing cards are worded for. A card built while the
 *  per-month view is on is worded for it at birth, so this only has to catch
 *  the cards that were already there when the reader pressed the chip. */
let wordedMonthly = monthly;

/** Re-word every standing card, for a language change or a change of reading.
 *  Rebuilding them would say the same thing and shut every open table doing
 *  it — and `setLabels` redraws, so this is not something to do per keystroke:
 *  `render` asks only when the reading has actually moved. */
function relabelCharts() {
  for (const chart of charts) {
    const words = chartWords(chart);
    chart.instance.setHeading({
      title: words.title,
      description: words.description,
      tableCaption: words.labels.tableCaption,
    });
    chart.instance.setLabels(words.labels);
  }
  wordedMonthly = monthly;
}

// One chip per reading rather than one that flips: both readings are named, so
// nobody has to press a button to find out what it does. The guard keeps a
// second press of the chip already showing from redrawing five cards.
for (const [button, wanted] of [[ui.viewTotal, false], [ui.viewMonthly, true]]) {
  button.addEventListener('click', () => {
    if (monthly === wanted) return;
    monthly = wanted;
    render();
  });
}

/* --------------------------------------------------------------- comparing */

/** Metrics that say nothing until the thing they measure exists. */
const CONDITIONAL_METRICS = {
  worth: (projections) => projections.some((p) => investsInside(p) || hasDebt(p) || hasOwned(p)),
  invested: (projections) => projections.some(investsInside),
  profit: (projections) => projections.some(investsInside),
  owned: (projections) => projections.some((p) => hasOwned(p)),
  debt: (projections) => projections.some((p) => hasDebt(p)),
};

function preferredMetric(projections) {
  return CONDITIONAL_METRICS.worth(projections) ? 'worth' : 'net';
}

let metric = 'net';
/** Whether the reader has picked a column themselves; until then it follows. */
let metricChosen = false;
let compareChart = null;

function strategyColor(index) {
  return `var(--strategy-${index + 1})`;
}

/** Built the first time there is something to compare, and rebuilt with the
 *  language after that — a reader who never compares never pays for it. */
function buildCompareChart() {
  if (compareChart) compareChart.destroy();
  const title = t('compare.chartTitle', t(`compare.metric.${metric}`));
  compareChart = createLineChart({
    mount: ui.compareChart,
    id: 'chart-compare',
    title,
    description: t('compare.chartDescription'),
    labels: {
      showTable: t('chart.showTable'),
      hideTable: t('chart.hideTable'),
      tableCaption: t('chart.tableCaption', title),
      monthColumn: t('chart.monthColumn'),
      ariaLabel: (months, endValue, count) => t('compare.aria', months, count),
      reading: (month, value) => t('chart.reading', month, value),
      seriesReading: (label, value) => t('chart.seriesReading', label, value),
    },
    formatValue: formatAmount,
    formatTick: formatCompact,
    formatMonth: (month) => formatMonth(month, t),
  });
}

const metricButtons = new Map();

/**
 * The metric buttons, which follow what the strategies actually contain.
 *
 * Reconciled in place rather than rebuilt, like every other control here. A
 * button replaced between mousedown and mouseup never fires a click at all —
 * and something as ordinary as leaving the strategy-name box triggers a render,
 * so a rebuild here would silently eat the reader's next click.
 */
function renderMetrics(projections) {
  const wanted = METRICS.filter((key) => {
    const gate = CONDITIONAL_METRICS[key];
    return !gate || gate(projections);
  });
  // Until the reader picks a column, show the one the note and the gap are
  // judged on. Otherwise a strategy that invests everything is announced as
  // coming out ahead directly above a chart showing its net far behind.
  if (!metricChosen) metric = preferredMetric(projections);
  // The same preference when a chosen column disappears, rather than dropping
  // to Net for good: the note and the gap column are judged on the total, so
  // falling past it left the chart titled Net under a table headed "Total vs
  // the first" and a note quoting a total.
  if (!wanted.includes(metric)) metric = preferredMetric(projections);

  let cursor = ui.compareMetrics.firstChild;
  for (const key of wanted) {
    let button = metricButtons.get(key);
    if (!button) {
      button = html('button', 'preset');
      button.type = 'button';
      button.dataset.metric = key;
      button.addEventListener('click', () => {
        metric = key;
        metricChosen = true;
        render();
      });
      metricButtons.set(key, button);
    }
    if (button !== cursor) ui.compareMetrics.insertBefore(button, cursor);
    else cursor = cursor.nextSibling;

    button.textContent = t(`compare.metric.${key}`);
    button.setAttribute('aria-pressed', key === metric ? 'true' : 'false');
  }

  for (const [key, button] of metricButtons) {
    if (wanted.includes(key)) continue;
    button.remove();
    metricButtons.delete(key);
  }
}

/** A row per strategy: what each one comes to, and the gap to the first. */
function renderCompareTable(projections) {
  // The same gates as the chips, so the table and the switch never disagree
  // about which halves of the balance sheet this comparison actually has.
  const shows = (key) => {
    const gate = CONDITIONAL_METRICS[key];
    return !gate || gate(projections);
  };
  const columns = [
    { key: 'income', total: (p) => p.totals.income },
    { key: 'expenses', total: (p) => p.totals.expenses },
    { key: 'net', total: (p) => p.totals.net },
    ...(shows('invested') ? [
      { key: 'invested', total: (p) => p.totals.invested },
      { key: 'profit', total: (p) => p.totals.profit },
    ] : []),
    ...(shows('owned') ? [{ key: 'owned', total: (p) => p.totals.owned }] : []),
    ...(shows('debt') ? [{ key: 'debt', total: (p) => p.totals.debt }] : []),
    ...(shows('worth') ? [{ key: 'worth', total: (p) => p.totals.worth }] : []),
  ];

  ui.compareHead.textContent = '';
  const corner = html('th', null, ui.compareHead);
  corner.scope = 'col';
  corner.textContent = t('compare.strategyColumn');
  for (const column of columns) {
    const cell = html('th', 'num', ui.compareHead);
    cell.scope = 'col';
    cell.textContent = t(`compare.metric.${column.key}`);
  }
  const deltaHead = html('th', 'num', ui.compareHead);
  deltaHead.scope = 'col';
  deltaHead.textContent = t('compare.deltaColumn', t(`compare.metric.${preferredMetric(projections)}`));

  // Judged on the total, not the net: a strategy that puts everything into an
  // investment keeps less cash and would read as "behind" while being ahead.
  // Without an investment the two are equal to the cent, so nothing changes.
  const baseline = projections[0].totals.worth;
  ui.compareBody.textContent = '';
  state.strategies.forEach((strategy, index) => {
    const row = html('tr', null, ui.compareBody);
    // A tint of 1.1:1 is not a cue, and colour alone is not one either. The
    // jump tabs and the changelog both mark where you are with aria-current and
    // something visible; this table marked it with the tint and nothing else.
    if (strategy.id === state.activeId) {
      row.classList.add('is-active');
      row.setAttribute('aria-current', 'true');
    }
    const name = html('th', null, row);
    name.scope = 'row';
    name.textContent = nameOf(strategy, index, t);
    const key = html('span', 'row-key', name);
    key.style.setProperty('--series', strategyColor(index));
    name.prepend(key);

    for (const column of columns) {
      const cell = html('td', 'num', row);
      cell.textContent = formatAmount(column.total(projections[index]));
    }

    const delta = html('td', 'num', row);
    const difference = roundToCent(projections[index].totals.worth - baseline);
    if (index === 0) {
      delta.textContent = t('compare.baseline');
      delta.classList.add('is-baseline');
    } else {
      delta.textContent = t(difference >= 0 ? 'compare.ahead' : 'compare.behind', formatAmount(Math.abs(difference)));
      delta.classList.toggle('is-ahead', difference > 0);
      delta.classList.toggle('is-behind', difference < 0);
    }
  });

  ui.compareCaption.textContent = t('compare.tableCaption', state.months);
}

/**
 * One projection, in whichever money the reader asked for. Restating happens
 * once, here, so every reader below — cards, tiles, tables, the comparison, and
 * the two extra runs behind a band — is looking at the same money.
 */
function runPlain(planFields) {
  return createScenarioRunner(state).plain(planFields);
}

function projectionFor(planFields) {
  return createScenarioRunner(state).run(planFields);
}

/* --------------------------------------------------------------- the flow */

let sankey = null;

function sankeyData(projection) {
  // A loan's repayment is not one thing, and one ribbon says only "this much
  // left" — which is the question the diagram exists to go past. So it arrives
  // as the parts it is actually made of, which sum to the same total. A loan
  // with neither interest nor fees is one part and keeps its plain name; once
  // it splits, every part is named, so no strand can be mistaken for the whole.
  const partsOf = (field) => {
    const whole = fieldTotalOf(field, projection.months);
    if (field.kind !== 'loan') return [{ field, weight: whole }];
    const parts = loanPartsOf(field, projection.months);
    const split = [
      { field, weight: parts.principal, part: 'principal' },
      { field, weight: parts.fees, part: 'fees' },
      { field, weight: parts.interest, part: 'interest' },
    ].filter((entry) => entry.weight > 0);
    if (split.length <= 1) return [{ field, weight: whole }];
    return split;
  };

  const weigh = (direction) => projection.fields
    .filter((field) => field.direction === direction)
    .flatMap(partsOf)
    .filter((entry) => entry.weight > 0);

  const incoming = weigh('income');
  const outgoing = weigh('expense');
  // Not all of what came in was earned by a field. Cashing a holding in puts
  // its balance into `income` too, and no field carries it — so apportioning
  // the whole of `income` across the fields would hand each of them a share of
  // money it never paid, and with no income field at all there would be nothing
  // on the left of a pool that is full on the right.
  const cashedIn = projection.totals.proceeds;
  const earned = roundToCent(projection.totals.income - cashedIn);
  const inShares = shareOut(earned, incoming.map((e) => e.weight));
  const outShares = shareOut(projection.totals.expenses, outgoing.map((e) => e.weight));

  const named = (entry, index, shares, tone) => {
    // "this field" is written for an aria label on a button; as the name of a
    // node beside a ribbon it reads as an instruction rather than a thing.
    const name = labelOf(entry.field, t) || t('sankey.unnamed');
    return {
      id: entry.part ? `${entry.field.id}:${entry.part}` : entry.field.id,
      label: entry.part ? t(`sankey.part.${entry.part}`, name) : name,
      value: shares[index],
      tone,
    };
  };
  // A share that rounds away to nothing is not a flow — the same rule the
  // leftover node follows. Left in, it would take the sliver every drawn flow
  // is guaranteed and sit in the table as "0 · 0%".
  const sources = incoming.map((entry, index) => named(entry, index, inShares, 'income'))
    .filter((entry) => entry.value > 0);
  const sinks = outgoing.map((entry, index) => named(entry, index, outShares, 'expense'))
    .filter((entry) => entry.value > 0);
  // A sale is money arriving, so it is a source like any other and wears the
  // same tone. It is one node however many holdings were sold: which field a
  // balance came from is not something the projection carries past the month
  // it was sold in, and the cards above name the holdings anyway.
  if (cashedIn > 0) {
    sources.push({ id: 'sold', label: t('sankey.sold'), value: cashedIn, tone: 'income' });
  }

  // What is left over is a destination like any other. When it is negative the
  // same node changes sides: the money had to come from somewhere, and saying
  // so is the only way the picture can still balance. When it is exactly
  // nothing there is no node at all — a flow of zero is not a flow, and the
  // sliver every drawn flow is guaranteed would be drawing money that stayed.
  const net = projection.totals.net;
  const drawnSources = roll(sources, 'income');
  const drawnSinks = roll(sinks, 'expense');
  if (net > 0) drawnSinks.push({ id: 'kept', label: t('sankey.kept'), value: net, tone: 'net' });
  if (net < 0) drawnSources.push({ id: 'shortfall', label: t('sankey.shortfall'), value: -net, tone: 'net' });

  const rows = [...sources, ...sinks];
  if (net > 0) rows.push({ id: 'kept', label: t('sankey.kept'), value: net, tone: 'net' });
  if (net < 0) rows.splice(sources.length, 0, {
    id: 'shortfall', label: t('sankey.shortfall'), value: -net, tone: 'net',
  });

  // Shares are worked out once, over every field, and then carried by whichever
  // node shows it. A pooled node takes the sum of what it pooled, so the
  // tooltip and the table can never give one field two percentages.
  const sourceCount = sources.length + (net < 0 ? 1 : 0);
  const shares = [
    ...shareOut(100, rows.slice(0, sourceCount).map((entry) => entry.value)),
    ...shareOut(100, rows.slice(sourceCount).map((entry) => entry.value)),
  ];
  rows.forEach((entry, index) => { entry.share = shares[index]; });
  const shareOfId = new Map(rows.map((entry) => [entry.id, entry.share]));
  const carryShare = (list, pooled) => list.forEach((entry) => {
    entry.share = shareOfId.has(entry.id)
      ? shareOfId.get(entry.id)
      : roundToCent(pooled.reduce((sum, hidden) => sum + (hidden.share || 0), 0));
  });
  carryShare(drawnSources, sources.filter((e) => !drawnSources.some((d) => d.id === e.id)));
  carryShare(drawnSinks, sinks.filter((e) => !drawnSinks.some((d) => d.id === e.id)));

  return {
    sources: drawnSources,
    sinks: drawnSinks,
    rows,
    sourceCount,
    total: net >= 0 ? projection.totals.income : projection.totals.expenses,
  };
}

/** How many strands a column can carry before it reads as stripes. */
const MAX_STRANDS = 9;

/**
 * Pool the smallest flows once a column has more than it can show.
 *
 * A hundred fields is allowed, and a hundred strands is not a diagram — past a
 * few dozen the gaps alone outrun the height and the column stops being drawn
 * at all. The largest keep their own ribbon, the rest become one, and the table
 * still lists every field on its own row, so nothing is lost, only pooled.
 */
function roll(list, tone) {
  if (list.length <= MAX_STRANDS) return [...list];
  const biggest = new Set([...list]
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_STRANDS - 1)
    .map((entry) => entry.id));
  const kept = list.filter((entry) => biggest.has(entry.id));
  const rest = list.filter((entry) => !biggest.has(entry.id));
  return [...kept, {
    id: `other-${tone}`,
    label: t('sankey.other', rest.length),
    value: roundToCent(rest.reduce((sum, entry) => sum + entry.value, 0)),
    tone,
  }];
}

/** Built the first time there is a flow worth drawing, and rebuilt with the
 *  language after that. */
function buildSankey() {
  if (sankey) sankey.destroy();
  sankey = createSankey({
    mount: ui.sankeyMount,
    id: 'sankey',
    title: t('sankey.title'),
    description: t('sankey.description'),
    labels: {
      showTable: t('chart.showTable'),
      hideTable: t('chart.hideTable'),
      tableCaption: t('sankey.tableCaption', state.months),
      nameColumn: t('sankey.nameColumn'),
      flowColumn: t('sankey.flowColumn'),
      shareColumn: t('sankey.shareColumn'),
      pool: t('sankey.pool'),
      tone: (tone) => t(`sankey.tone.${tone}`),
      rowTone: (tone) => t('sankey.rowTone', tone),
      tipValue: (amount, share) => t('sankey.tipValue', amount, formatAmount(share)),
      share: (value) => t('sankey.share', formatAmount(value)),
      aria: (total, sources, sinks) => t('sankey.aria', total, sources, sinks),
    },
    formatValue: formatAmount,
  });
}

function renderSankey(projection) {
  const data = sankeyData(projection);
  // Two nodes is not a diagram, it is a sentence — and the summary already says
  // it. The flow appears once something actually splits.
  // Both gates read the same quantity the drawing does: a restatement can round
  // every flow away, and a section that appears only to say "give a field an
  // amount" is worse than one that stays out of the way.
  // Every clause the drawing itself requires (sankey.js's `drawable`), plus the
  // one this section adds: two nodes is not a diagram, it is a sentence, and
  // the summary already says it. Opening the section on a weaker test than the
  // drawing uses is how it came to render "give a field an amount" over a plan
  // where every field had one.
  const worth = hasAmounts(projection)
    && data.total > 0
    && data.sources.length > 0 && data.sinks.length > 0
    && data.sources.length + data.sinks.length >= 3;
  ui.sankey.hidden = !worth;
  if (!worth) return;

  if (!sankey) buildSankey();
  sankey.setHeading({
    title: t('sankey.title'),
    description: t('sankey.description'),
    tableCaption: t('sankey.tableCaption', projection.months),
  });
  sankey.update({ ...data, isEmpty: false, emptyMessage: t('charts.empty') });
}

/** Cents, so a difference of two rounded totals doesn't show float noise. */
function roundToCent(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function renderComparison(projections) {
  const comparing = state.strategies.length > 1;
  ui.compare.hidden = !comparing;
  if (!comparing) return;
  if (viewMode === 'simple') { if (!metricChosen) metric = preferred; return; }

  if (!compareChart) buildCompareChart();

  renderMetrics(projections);

  const metricName = t(`compare.metric.${metric}`);
  compareChart.setHeading({
    title: t('compare.chartTitle', metricName),
    description: t('compare.chartDescription'),
    tableCaption: t('chart.tableCaption', t('compare.chartTitle', metricName)),
  });

  const series = state.strategies.map((strategy, index) => ({
    id: strategy.id,
    label: nameOf(strategy, index, t),
    color: strategyColor(index),
    points: seriesOf(projections[index], metric),
  }));

  compareChart.update({
    series,
    domain: extentOf(series.map((entry) => entry.points)),
    months: state.months,
    isEmpty: !projections.some((projection) => hasAmounts(projection)),
    emptyMessage: t('charts.empty'),
  });

  renderCompareTable(projections);

  window.clearTimeout(compareNoteTimer);
  compareNoteTimer = window.setTimeout(() => {
    const best = state.strategies
      .map((strategy, index) => ({ strategy, index, worth: projections[index].totals.worth }))
      .reduce((a, b) => (b.worth > a.worth ? b : a));
    // Judged on the total, whatever the chart is showing — that is the
    // question the section answers. But it has to say so: read out above a
    // chart of Profit, an unqualified "comes out ahead" named the plan with the
    // lowest profit of the three, and quoted a figure that was nowhere on it.
    // So it names the quantity, and names it the way the gap column does.
    const judged = preferredMetric(projections);
    ui.compareNote.textContent = t(
      'compare.note',
      nameOf(best.strategy, best.index, t),
      t(`compare.metric.${judged}`),
      formatAmount(best.worth),
      state.months,
    );
  }, 500);
}

let compareNoteTimer = 0;

/* ---------------------------------------------------------------- ranking */

/**
 * The last ranking worked out, kept beside the exact question it answers.
 *
 * Ranking a plan is two projections per field, and `render()` runs on every
 * keystroke — including the ones in a name box, which move no figure at all.
 * So the answer is kept with everything it was worked out from, and any render
 * that did not change the question gets it back for nothing.
 */
let ranked = { question: '', rows: [] };

/** Worked out once the typing settles rather than on every keystroke: this is
 *  the one reading in the app that a hundred fields could make genuinely
 *  expensive, and half a second of the previous answer is the same bargain the
 *  notes under the charts and the comparison already strike. */
let rankTimer = 0;

/** Which question the slices in flight are answering. Bumped whenever the
 *  answer stops being wanted — a new question, or the plans thrown away — so a
 *  job that is part way through a hundred fields drops what it is doing rather
 *  than painting an answer to something nobody asked any more. */
let rankJob = 0;

/** How long one slice may hold the thread. Eight leaves the rest of a frame
 *  for whatever the reader is doing while the answer is worked out. */
const RANK_SLICE_MS = 8;

/**
 * Everything a ranking depends on, written down. The fields carry their own
 * amounts and windows, and the rest of it is the horizon, the money the figures
 * are read in, and the column they are judged on — nothing else reaches the
 * swings, so two renders agreeing on this agree on the answer.
 */
function rankingQuestion(projection, key) {
  return JSON.stringify([
    projection.fields, projection.months, projection.taxRate,
    state.realMoney, state.inflation, key,
  ]);
}

/** Emptied when the plans themselves are thrown away, rather than left holding
 *  a ranking of something that is no longer on the device. */
function forgetRanking() {
  ranked = { question: '', rows: [] };
  rankJob += 1;
}

function workOutRanking(projection, key, question) {
  const job = (rankJob += 1);
  const movers = moversOf(projection);
  const rows = [];
  let next = 0;

  const slice = () => {
    if (job !== rankJob) return;
    const until = performance.now() + RANK_SLICE_MS;
    while (next < movers.length && performance.now() < until) {
      rows.push(swingOf(projection, key, runPlain, movers[next]));
      next += 1;
    }
    if (next < movers.length) {
      rankTimer = window.setTimeout(slice, 0);
      return;
    }
    ranked = { question, rows: orderBySwing(rows) };
    paintRanking(projection, key);
    // The section is held back until there is an answer in it, so this is the
    // render that lets it in.
    ui.rank.hidden = false;
  };

  slice();
}

/** The rows, and the line saying what they are. Split out from the deciding
 *  above it because the same rows are painted whether they were just worked
 *  out or came back out of the last answer. */
function paintRanking(projection, key) {
  ui.rankNote.textContent = t('rank.note', t(`compare.metric.${key}`), projection.months);
  // The largest swing is the first, so it is what every bar is drawn against.
  const widest = ranked.rows.length ? Math.abs(ranked.rows[0].swing) : 0;
  // A plan can hold nothing at all that touches the column being read — every
  // plan the app opens on is like that on Profit inside twenty years, because
  // its fund only starts once the housing is paid for; the two renters' funds
  // run from month one and rank. There is no order to put
  // those fields in, so the fact is said once instead of on every line.
  ui.rankList.hidden = !widest;
  ui.rankSaid.hidden = Boolean(widest);

  // Rebuilt rather than reconciled, the way the comparison table is: there is
  // nothing here to focus and so nothing to lose by replacing it.
  ui.rankList.textContent = '';
  if (!widest) {
    ui.rankSaid.textContent = t('rank.said.nothing', t(`compare.metric.${key}`));
    return;
  }
  for (const row of ranked.rows) {
    const item = html('li', 'rank-row', ui.rankList);
    const name = html('span', 'rank-name', item);
    name.textContent = labelOf(row.field, t) || t('sankey.unnamed');

    const track = html('span', 'rank-track', item);
    // The drawing says nothing the line beside it does not, so it is chrome.
    track.setAttribute('aria-hidden', 'true');
    const bar = html('span', 'rank-bar', track);
    // Every swing that exists gets a visible sliver — the rule the flow diagram
    // gives every ribbon, and for the same reason — while a field that really
    // does move nothing gets no bar at all rather than one saying otherwise.
    bar.style.width = row.swing
      ? `max(2px, ${((Math.abs(row.swing) / widest) * 100).toFixed(2)}%)`
      : '0';

    const value = html('span', 'rank-value', item);
    // The sign is the comparison's, spelled once. A swing is ahead or behind in
    // exactly the way a strategy is, and a second spelling would be a second
    // typographic minus sign waiting to disagree with the first.
    value.textContent = row.swing
      ? t(row.swing > 0 ? 'compare.ahead' : 'compare.behind', formatAmount(Math.abs(row.swing)))
      : t('rank.nothing');
  }
}

function renderRanking(projection, projections) {
  // Two amounts is the least that can be put in an order; one field ranked
  // against nothing is a single line announcing that it matters most.
  const rankable = projection.fields.filter((field) => toAmount(field.amount) > 0).length > 1;
  ui.rank.hidden = !rankable;
  window.clearTimeout(rankTimer);
  if (!rankable) {
    // Dropped rather than kept: a plan emptied and filled again would otherwise
    // put the old ranking back on screen while the new one is being worked out.
    forgetRanking();
    return;
  }

  // The comparison's own column wherever there is a comparison — a reader who
  // switched those chips to Profit is asking about profit, and a list ranked on
  // something else directly underneath would answer a question nobody put. With
  // one plan there are no chips, so it falls back to the same preference the
  // comparison itself would have opened on.
  const key = projections.length > 1 ? metric : preferredMetric(projections);
  const question = rankingQuestion(projection, key);
  // Visible once it has something to say: either this question is already
  // answered, or a previous answer is still on screen and worth keeping there
  // while the new one is worked out. With neither, the section waits rather
  // than showing an empty list under a line claiming nothing moves the figure.
  ui.rank.hidden = !rankable || (question !== ranked.question && !ranked.rows.length);

  const answer = () => {
    if (question !== ranked.question) {
      // `runPlain`, not `projectionFor`: the projection handed in was built
      // from the plan `schedule` already placed, so its months are settled and
      // every swing is one projection instead of one full re-resolution.
      //
      // That is not only cheaper, it is what makes the reading true. The list
      // tells the reader, in `rank.caveat.parts`, that the swings add up "to
      // the cent" — which holds because the model is separable, and stops
      // holding the moment a swing is allowed to move a target's month and
      // drag every field waiting on it. Measured on a plan renting until a
      // deposit is saved: re-resolving each swing put the pair 360 out; on the
      // placed plan they add up exactly. A ranking whose own caveat is false
      // is worse than a slow one.
      workOutRanking(projection, key, question);
      return;
    }
    paintRanking(projection, key);
  };

  // Already answered: nothing to wait for. Otherwise the wait stands even with
  // nothing on screen — it used to be skipped in that case, which is exactly
  // the cold load, so the whole ranking ran inside the first render and the
  // page did not paint until it finished.
  if (question === ranked.question) answer();
  else rankTimer = window.setTimeout(answer, 500);
}

/* -------------------------------------------------------------- milestones */

/**
 * Which column a new target opens on.
 *
 * Module state for the same reason `metric` is: it is settled by a render and
 * read by a command that happens between two of them. Without it, adding a
 * target would have to run every projection again purely to find out what the
 * page is currently being judged on.
 */
let preferred = 'net';

/**
 * When a target is met, in words.
 *
 * Three answers, and the third is one: a target the plan never reaches says so
 * where the month would have been, rather than being left to fall off the end
 * of a chart with nothing to explain the absence.
 */
function milestoneSaid(projection, milestone) {
  const reading = whenMet(projection, milestone, toNumber);
  if (!reading) return t('milestone.said.pending');
  if (reading.month === null) {
    return t('milestone.said.never', formatHorizon(projection.months, t), formatAmount(reading.value));
  }
  // Month 0 is not a month the plan arrives at, it is where the plan starts.
  // "First true at month 0" would offer a date for something that was never
  // not the case — the house the borrower's plan opens owning, for instance.
  if (reading.month === 0) return t('milestone.said.always', formatAmount(reading.value));
  return t('milestone.said.met', reading.month, formatAmount(reading.value));
}

function milestoneRules(projection) {
  const months = new Set();
  for (const milestone of state.milestones) {
    const reading = whenMet(projection, milestone, toNumber);
    if (reading && reading.month !== null) months.add(reading.month);
  }
  return [...months].map((month) => ({ month }));
}

/* ------------------------------------------------------- the same, backwards */

/** Whether a target is one the plan misses — the whole of what the ask is for. */
function unreached(projection, milestone) {
  const reading = whenMet(projection, milestone, toNumber);
  return Boolean(reading) && reading.month === null;
}

let asked = { id: '', key: '', question: '', result: null };

/** Everything an answer depends on, written down. */
function goalQuestion(projection, milestone, key) {
  return JSON.stringify([
    fields(), state.milestones, projection.months, projection.taxRate,
    state.realMoney, state.inflation, milestone.metric, milestone.amount, key,
  ]);
}

/** Emptied when the plans it was an answer about are thrown away. */
function forgetAsked() {
  asked = { id: '', key: '', question: '', result: null };
}

function goalFigure(knob, value) {
  return knob === 'annualRate' ? t('goal.rate', formatTyped(value)) : formatAmount(value);
}

/** What one candidate is called: a field, and which of its two figures. */
function goalName(candidate) {
  // The same fallback the ranking uses, for the same reason: a field nobody has
  // named still has to be pickable out of a list of its neighbours.
  return t('goal.candidate', labelOf(candidate.field, t) || t('sankey.unnamed'), t(`goal.knob.${candidate.knob}`));
}

/**
 * The answer in words — or the refusal, which gets exactly as many of them.
 *
 * A refusal is not an error message and is not written like one. It is the app
 * saying which of four different things it found, and each of the four sends a
 * reader somewhere else in their plan.
 */
function goalSaid(candidate, result) {
  if (!result) return '';
  const name = labelOf(candidate.field, t) || t('sankey.unnamed');
  const figure = t(`goal.knob.${candidate.knob}`);
  if (result.refusal) return t(`goal.refusal.${result.refusal}`, name, figure);
  return t(
    `goal.said.${result.bound}`,
    name, figure, goalFigure(candidate.knob, result.answer), result.month,
  );
}

/** Work one target backwards, and remember the answer against its question. */
function askGoal(id, key) {
  const projection = projectionFor(fields());
  const milestone = state.milestones.find((entry) => entry.id === id);
  const candidate = candidatesOf(fields()).find((entry) => entry.key === key);
  // Nothing to ask about leaves nothing standing: the answer on screen was to
  // some other question, and it is not made truer by this one failing.
  if (!milestone || !candidate) {
    forgetAsked();
    return;
  }
  const result = solveFor({
    fields: fields(),
    fieldId: candidate.field.id,
    knob: candidate.knob,
    milestone,
    // The same run every other reading on the page is made with, so an answer
    // is in the money the page is being read in rather than in the model's.
    run: projectionFor,
    read: toNumber,
  });
  asked = { id, key, question: goalQuestion(projection, milestone, key), result };
}

function milestoneLabels(projection) {
  const offered = candidatesOf(fields());
  // Only one target holds an answer at a time, so whether that answer is still
  // an answer to the question it was given is settled once here rather than
  // re-derived on every row — and it is put into words here too, on the render
  // that shows it, so that it is in the language the page is in now.
  const holder = state.milestones.find((milestone) => milestone.id === asked.id);
  const standing = Boolean(asked.result) && Boolean(holder)
    && goalQuestion(projection, holder, asked.key) === asked.question;
  const candidate = standing ? offered.find((entry) => entry.key === asked.key) : null;
  const answer = candidate ? goalSaid(candidate, asked.result) : '';

  return {
    add: t('milestone.add'),
    what: t('milestone.what'),
    name: t('milestone.name'),
    namePlaceholder: t('milestone.namePlaceholder'),
    figure: t('milestone.figure'),
    figureNamed: (metric) => t('milestone.figureNamed', metric),
    removeNamed: (metric) => t('milestone.removeNamed', metric),
    references: (one) => referencesTo(state.strategies, one.id),
    used: (count) => t('milestone.used', count),
    // The comparison's own names, never a second spelling of the same eight
    // quantities: "Total" reading one way in a chip and another in a target is
    // two words for one thing on one page.
    metricName: (key) => t(`compare.metric.${key}`),
    // Worded here rather than in the view, because the month is a read over a
    // projection and the view has never seen one.
    said: (milestone) => milestoneSaid(projection, milestone),
    ask: t('goal.ask'),
    askNamed: (metric) => t('goal.askNamed', metric),
    choose: t('goal.choose'),
    chooseNamed: (metric) => t('goal.chooseNamed', metric),
    // Every figure in the plan that can be asked backwards about, named. The
    // list is the same on every row — it is a property of the plan rather than
    // of the target — so it is built once a render rather than once a row.
    candidates: offered.map((entry) => ({ key: entry.key, name: goalName(entry) })),
    canAsk: (milestone) => unreached(projection, milestone),
    asked: (milestone) => (milestone.id === asked.id ? answer : ''),
  };
}

function renderMilestones(projection) {
  const marked = state.milestones.length > 0;
  const broken = missingTargets(state.strategies, state.milestones).length > 0;
  const visible = marked || broken;
  // A legacy store may have references after its last target was removed.
  // Keep the warning visible even when there are no target rows left.
  ui.milestones.hidden = !visible;
  // What the ask can do and what it refuses to, shown where the ask is: on a
  // page where every target is met it would be a caveat about a control the
  // reader has never been offered.
  ui.goalCaveat.hidden = !state.milestones.some((milestone) => unreached(projection, milestone));
  // One affordance in. The button under the cards is the whole of the feature
  // until there is something to show, and it goes the moment the section it
  // opens can speak for itself — two ways to add the first target, one of them
  // permanently visible, is an empty state wearing a button.
  ui.addMilestone.hidden = visible;
  // Written even when there is nothing to write. Skipping it while the section
  // is hidden would leave the row of a removed target standing inside it,
  // invisible and out of date, waiting to be shown again by the next target
  // somebody adds.
  // Said once, above the list, rather than on the row that happens to be last
  // to move: when two targets chase each other there is no one row at fault.
  ui.milestoneUnsettled.hidden = projection.schedule.settled;
  ui.milestoneInvalid.hidden = !broken;
  milestoneList.update(state.milestones, milestoneLabels(projection), t);
}

/** Every edit the target list can ask for. */
function runMilestoneCommand(command) {
  if (command.type === 'advanced') { changeMode('advanced'); milestoneList.openDetails(command.id); return; }
  switch (command.type) {
    case 'update':
      state.milestones = updateMilestone(state.milestones, command.id, command.patch, METRICS);
      break;

    case 'settle': {
      // The reader left the box: show the figure the read will actually use, in
      // their own decimal separator. Unlike a field's amount this keeps its
      // sign — a field's direction carries the sign so the box never needs one,
      // and a target has no direction: "net reaches −5,000" is a perfectly fair
      // thing to want the month of.
      const patch = settleTargetPatch(command.patch, formatTyped);
      state.milestones = updateMilestone(state.milestones, command.id, patch, METRICS);
      break;
    }

    case 'add': {
      const before = new Set(state.milestones.map((milestone) => milestone.id));
      // Opened on whatever the page is being judged on, so the reader's first
      // move is to type a figure rather than to go looking for a column.
      state.milestones = addMilestone(state.milestones, METRICS, { metric: viewMode === 'simple' ? 'net' : preferred });
      const created = state.milestones.find((milestone) => !before.has(milestone.id));
      persist();
      render();
      // Adding the first target hides the button that was just pressed, and
      // setting `hidden` on the focused element drops focus to the document —
      // so it is put on the box the reader now has to fill in.
      milestoneList.focus(created ? created.id : null);
      return;
    }

    case 'ask':
      // Worked out here rather than in the view for the reason the month under
      // each row is: it is a read over projections the view has never seen. It
      // is also the one command in this list that changes no state a plan
      // carries — the answer is said, and nothing is written into the plan —
      // so it neither persists nor checkpoints anything.
      askGoal(command.id, command.key);
      render();
      return;

    case 'remove': {
      // The fifth undoable move, and the one the gap was filed without: a
      // target is a figure somebody typed, and the button that removes it is
      // the same button that removes a field.
      const next = removeTarget(planOf(state), command.id);
      if (!next) return;
      checkpoint('milestone');
      const neighbour = milestoneNeighbourOf(state.milestones, command.id);
      state.milestones = next.milestones;
      persist();
      render();
      // Removing the last one hides the section this button lived in, which
      // takes focus with it: land it on the way back in.
      if (state.milestones.length) milestoneList.focus(neighbour);
      else ui.addMilestone.focus();
      return;
    }

    default:
      return;
  }

  persist();
  render();
}

ui.addMilestone.addEventListener('click', () => runMilestoneCommand({ type: 'add' }));

/* --------------------------------------------------------------- field list */

function fieldLabels(placed) {
  return labelsForFields({ state, placed, t });
}

/**
 * A name box is seeded with the field's translated default, so a name equal to
 * that default means "still the default" — not a name of the reader's own.
 * Without this, tabbing through the box (or typing the same word and never
 * leaving it) would pin the current language's word forever.
 */

function shownProjects() {
  return parkOpen(state.projects, state.openProjectId, state);
}

function projectLabels() {
  return {
    switchAria: (name, count) => (count > 1
      ? t('project.switchAria', name, count)
      : t('project.switchAriaOnly', name)),
    add: t('project.add'),
    nameAria: t('project.nameAria'),
    namePlaceholder: t('project.namePlaceholder'),
    openNamed: (name) => t('project.openNamed', name),
    removeNamed: (name) => t('project.removeNamed', name),
    count: (plans, months) => t('project.count', plans, formatHorizon(months, t)),
    // The lead counts them, in the same shape the switch's own label counts
    // plans: a reader on a 320px phone sees the first template and the top of
    // the second, and the line above both is the only thing that can say
    // whether that is the whole shelf or the start of it.
    templateFrom: (count) => (count > 1
      ? t('template.fromCount', count)
      : t('template.from')),
    templateClaim: t('template.claim'),
    templateAria: (name) => t('template.startedAria', name),
  };
}

function runProjectCommand(command) {
  switch (command.type) {
    case 'open': {
      if (command.id === state.openProjectId) return;
      // The one move that touches two records: everything on screen goes back
      // into the project it belongs to as the next one's plan comes out. One
      // expression, because the instant where two copies of a plan exist should
      // not be a window between two statements.
      {
        const moved = moveOpen(state.projects, state.openProjectId, command.id, state);
        state.projects = moved.projects;
        state.openProjectId = openIdOf(state.projects, command.id);
        Object.assign(state, moved.plan);
      }
      // The plans, the horizon and the targets have all just been replaced, so
      // anything held about the last set is an answer to a question nobody is
      // asking. The undo stack is deliberately *not* thrown away with them: a
      // snapshot names the project it photographed and is only offered back
      // there, so the removal made in the question being left is still waiting
      // when the reader comes back to it.
      forgetRanking();
      forgetAsked();
      metricChosen = false;
      interfaceView.clearDrafts();
      fillControls();
      save();
      render();
      // The sheet's work is done, so it gets out of the way — it is a modal over
      // the very page the reader just asked to see, and leaving it standing
      // would make choosing a project a two-press move for no reason. (Measured
      // by driving it: the answer was behind the sheet.) Adding and renaming
      // leave it open, because neither of those is finished yet.
      ui.projectsDialog.close();
      projectSwitch.element.focus();
      return;
    }

    case 'rename':
      state.projects = updateProject(state.projects, command.id, { name: command.name });
      break;

    case 'settle': {
      // A name box shows what the project is called when nothing has been
      // typed, so typing that same word back means "still unnamed" — exactly
      // the rule a strategy's name box follows, and for the same reason: a
      // name the app gave it must go on following the language.
      const index = state.projects.findIndex((project) => project.id === command.id);
      const shown = projectNameOf(
        { ...state.projects[index], name: '' }, index, state.projects.length, t,
      );
      const typed = String(command.name).trim();
      state.projects = updateProject(state.projects, command.id, {
        name: typed === shown ? '' : typed,
      });
      break;
    }

    case 'add': {
      if (state.projects.length >= MAX_PROJECTS) return;
      ui.projectsDialog.close();
      interfaceView.showWelcome();
      return;
    }

    case 'template': {
      if (state.projects.length >= MAX_PROJECTS) return;
      const template = templateOf(command.template);
      if (!template) return;
      const built = template.build(t);
      const created = normalizeProject({ nameKey: built.nameKey }, projectCoerce, false);
      state.projects = addProject(
        parkOpen(state.projects, state.openProjectId, state), created,
      );
      state.openProjectId = created.id;
      Object.assign(state, normalizePlan(built, projectCoerce));
      state.projects = state.projects.map(
        (project) => (project.id === created.id ? { ...project, plan: null } : project),
      );
      forgetRanking();
      forgetAsked();
      metricChosen = false;
      interfaceView.clearDrafts();
      fillControls();
      save();
      render();
      ui.projectsDialog.close();
      projectSwitch.element.focus();
      return;
    }

    case 'remove': {
      // The largest thing one press can throw away in this app: every plan in
      // the project, its horizon and its targets.
      if (state.projects.length <= 1) return;
      const leaving = command.id === state.openProjectId;
      // The snapshot is of the project *going*, not of the one the reader is
      // standing in — a removal is the one move made to a project rather than
      // inside one, so its undo has to be offered wherever the reader ends up
      // and has to put that project's own plan back.
      {
        const shelf = parkOpen(state.projects, state.openProjectId, state);
        const going = shelf.find((project) => project.id === command.id);
        state.projects = shelf;
        checkpointShelf('project', going.plan, command.id);
      }
      const neighbour = projectNeighbourOf(state.projects, command.id);
      state.projects = removeProject(state.projects, command.id);
      if (leaving) {
        state.openProjectId = openIdOf(state.projects, neighbour);
        Object.assign(state, moveOpen(state.projects, '', state.openProjectId, state).plan);
        state.projects = state.projects.map(
          (project) => (project.id === state.openProjectId ? { ...project, plan: null } : project),
        );
        forgetRanking();
        forgetAsked();
        metricChosen = false;
        fillControls();
      }
      save();
      render();
      projectList.focusAfterRemove();
      return;
    }

    default:
      return;
  }

  persist();
  render();
}

function normalizeLabelPatch(patch, id) {
  if (!('label' in patch)) return patch;
  const field = fields().find((entry) => entry.id === id);
  const dictionaryName = field && field.labelKey ? t(field.labelKey) : '';
  return String(patch.label).trim() === dictionaryName ? { ...patch, label: '' } : patch;
}

function strategyLabels() {
  return {
    tabsAria: t('strategy.tabsAria'),
    origin: (state) => t(`strategy.origin.${state}`),
    nameAria: t('strategy.nameAria'),
    namePlaceholder: t('strategy.namePlaceholder'),
    add: t('strategy.add'),
    addFirst: t('strategy.addFirst'),
    switchTo: (name) => t('strategy.switchTo', name),
    removeNamed: (name) => t('strategy.removeNamed', name),
    jumpAria: t('strategy.jumpAria'),
    onNamed: (name) => t('strategy.onNamed', name),
  };
}

/**
 * Every edit the strategy bar can ask for. Adding one copies what is on screen
 * — comparing almost always means "the same, but…", and starting from a blank
 * list would mean typing everything twice.
 */
function runStrategyCommand(command) {
  switch (command.type) {
    case 'select': {
      // The tab just pressed becomes the active strategy, so the next render
      // hides it and puts the name box in its place — and setting `hidden` on
      // the focused element drops focus to the document.
      state.activeId = activeIdOf(state.strategies, command.id);
      persist();
      render();
      bar.focusTab(state.activeId);
      return;
    }

    case 'rename':
      state.strategies = updateStrategy(state.strategies, command.id, { name: command.name });
      break;

    case 'settle': {
      // A name box shows the position when the strategy is unnamed, so typing
      // that same word back means "still unnamed", not a name of one's own.
      const index = state.strategies.findIndex((strategy) => strategy.id === command.id);
      const positional = t('strategy.defaultName', index + 1);
      const typed = String(command.name).trim();
      state.strategies = updateStrategy(state.strategies, command.id, {
        name: typed === positional ? '' : typed,
      });
      break;
    }

    case 'add': {
      const before = new Set(state.strategies.map((strategy) => strategy.id));
      state.strategies = duplicateStrategy(
        state.strategies, state.activeId, (name) => t('strategy.copyOf', name), t,
      );
      const created = state.strategies.find((strategy) => !before.has(strategy.id));
      if (created) state.activeId = created.id;
      persist();
      render();
      if (created) bar.focusName(created.id);
      return;
    }

    case 'remove': {
      // A whole plan, which is the largest thing one press can throw away short
      // of starting again.
      checkpoint('strategy');
      const neighbour = strategyNeighbourOf(state.strategies, state.activeId);
      state.strategies = removeStrategy(state.strategies, state.activeId);
      state.activeId = activeIdOf(state.strategies, neighbour);
      // Removing the second-to-last one hides the row this button is in, which
      // takes focus with it: land it on whatever is still on screen.
      persist();
      render();
      bar.focusAfterRemove();
      return;
    }

    default:
      return;
  }

  persist();
  render();
}

/** A field as it now stands in the strategy on screen. */
function fieldById(id) {
  return fields().find((field) => field.id === id) || null;
}

/**
 * Carry an edit out to the other strategies, if this field is one they share.
 * Called after the edit has landed locally, so what spreads is the field as it
 * now reads rather than the patch that produced it.
 */
function spreadIfSynced(id) {
  const field = fieldById(id);
  if (field && field.synced) state.strategies = spreadField(state.strategies, field);
}

/** Every edit the list can ask for. Each one ends in the same place: new
 *  fields, saved, redrawn, with focus left where the reader expects it. */
function runCommand(command) {
  if (command.type === 'advanced') { changeMode('advanced'); setRail(true); list.openDetails(command.id); return; }
  switch (command.type) {
    case 'update':
      setActiveFields(updateField(fields(), command.id, normalizeLabelPatch(command.patch, command.id)));
      spreadIfSynced(command.id);
      break;

    case 'settle': {
      // The reader left a box: show what the projection will actually use —
      // the rounded amount, the trimmed name, or the default name restored.
      const patch = { ...command.patch };
      if ('amount' in patch) {
        const amount = toAmount(patch.amount);
        // Their own decimal separator: a French reader who typed 12,50 and got
        // back 12.5 would reasonably think the app had misread them.
        patch.amount = String(patch.amount).trim() ? formatTyped(amount) : '';
      }
      if ('fees' in patch) {
        const fees = toAmount(patch.fees);
        patch.fees = String(patch.fees).trim() ? formatTyped(fees) : '';
      }
      if ('annualRate' in patch) {
        const rate = toRateNumber(patch.annualRate);
        patch.annualRate = Number.isFinite(rate)
          ? formatTyped(annualPercent(rate, fieldById(command.id)?.kind === 'loan' ? 0 : -100)) : '';
      }
      setActiveFields(updateField(fields(), command.id, normalizeLabelPatch(patch, command.id)));
      spreadIfSynced(command.id);
      break;
    }

    case 'sync': {
      // Turning it on is what establishes the link, so this is the one moment
      // a counterpart is looked for by name rather than by id.
      const field = fieldById(command.id);
      if (!field) return;
      state.strategies = field.synced
        ? unlinkField(state.strategies, command.id)
        : spreadField(state.strategies, { ...field, synced: true });
      break;
    }

    case 'add': {
      setActiveFields(addField(fields(), { kind: command.kind || 'plain', direction: command.direction || 'expense', ...(command.kind === 'plain' ? { labelKey: command.direction === 'income' ? 'field.default.income' : 'field.default.expense' } : {}) }));
      persist();
      render();
      const added = fields();
      list.focus(added.length ? added[added.length - 1].id : null, { select: true });
      return;
    }

    case 'duplicate': {
      const before = new Set(fields().map((field) => field.id));
      setActiveFields(duplicateField(fields(), command.id, (name) => t('field.copyOf', name), t));
      const copy = fields().find((field) => !before.has(field.id));
      persist();
      render();
      list.focus(copy ? copy.id : command.id, { select: true });
      return;
    }

    case 'remove': {
      // First, before anything is taken away — and a synced field is removed
      // from every plan at once, so what has to be photographed is the whole
      // state rather than the list on screen.
      checkpoint('field');
      const neighbour = neighbourOf(fields(), command.id);
      const field = fieldById(command.id);
      // A synced field is one field. Removing it here removes it, full stop —
      // and a reader who wanted it gone from this plan only unsyncs it first.
      if (field && field.synced) state.strategies = removeEverywhere(state.strategies, command.id);
      else setActiveFields(removeField(fields(), command.id));
      persist();
      render();
      list.focus(neighbour);
      return;
    }

    default:
      return;
  }

  persist();
  render();
}

/* ------------------------------------------------------------------- render */

let noteTimer = 0;

function renderSummary(projection, hasInput) {
  const horizon = formatHorizon(projection.months, t);
  ui.heroLabel.textContent = `${t('ui.cash')} · ${horizon}`;
  // Exact amounts, not rounded ones: whole-unit rounding let the tiles and the
  // hero disagree by a unit (24,010 − 0 shown against a net of 24,009).
  ui.heroValue.textContent = hasInput ? formatAmount(projection.totals.net) : '—';
  ui.totalIncome.textContent = hasInput ? formatAmount(projection.totals.income) : '—';
  ui.totalExpenses.textContent = hasInput ? formatAmount(projection.totals.expenses) : '—';
  ui.monthlyNet.textContent = hasInput ? formatAmount(projection.averages.net) : '—';

  ui.summary.classList.toggle('is-empty', !hasInput);

  const dry = runsDryAt(projection);
  const shortfall = projection.averages.net < 0;
  const critical = Boolean(dry) || shortfall;
  // A plan that averages exactly nothing still has a chip if it ran dry on the
  // way there — that is precisely the plan the average hides.
  ui.heroChip.hidden = !hasInput || (!dry && projection.averages.net === 0);
  ui.heroChip.classList.toggle('is-critical', critical);
  ui.heroChip.classList.toggle('is-good', !critical);
  if (dry) {
    ui.heroChipText.textContent = t('summary.runsDry', dry.month, formatAmount(Math.abs(dry.worst)));
  } else {
    ui.heroChipText.textContent = shortfall
      ? t('summary.shortfall', formatAmount(Math.abs(projection.averages.net)))
      : t('summary.surplus', formatAmount(projection.averages.net));
  }
  ui.chipIconPath.setAttribute('d', critical ? STATUS_ICONS.shortfall : STATUS_ICONS.surplus);

  // One polite announcement once typing settles, rather than one per keystroke.
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => {
    ui.chartsNote.textContent = hasInput
      ? t(
        'charts.noteFilled',
        horizon,
        formatAmount(projection.totals.income),
        formatAmount(projection.totals.expenses),
        formatAmount(projection.totals.net),
      )
      : t('charts.notePrompt');
  }, 500);
}

function render() {
  const projections = state.strategies.map(
    (strategy) => projectionFor(strategy.fields),
  );
  const projection = projections[activeIndex()];
  const hasInput = hasAmounts(projection);
  // Settled once a frame so that a command landing between two renders — adding
  // a target, say — can ask what the page is being judged on without running
  // every projection a second time to find out.
  preferred = preferredMetric(projections);

  // The conditional cards come and go with the fields, so they are rebuilt
  // only when the set actually changes rather than on every keystroke.
  const wantsInvestments = investsInside(projection);
  const specs = activeCharts(projection);
  syncCharts(specs);
  // A card built just now was worded for the reading on screen; one that was
  // already standing was not, and `setLabels` redraws it — so this is asked
  // only when the reading has moved, never on a keystroke.
  if (wordedMonthly !== monthly) relabelCharts();
  // Every series on the page comes through here, so the two readings can never
  // end up drawn from different runs of the model.
  const readingOf = (run, key) => (monthly ? monthlyOf(run, key) : seriesOf(run, key));
  const series = specs.map((spec) => readingOf(projection, spec.key));

  // The two runs behind a band: the same plan with every return moved down and
  // up. Only worth computing when something actually depends on a return.
  const spread = toRateNumber(state.spread);
  const ranged = state.showRange && Number.isFinite(spread) && spread > 0
    && (investsInside(projection) || hasOwned(projection));
  const lower = ranged ? projectionFor(shiftReturns(fields(), -spread)) : null;
  const upper = ranged ? projectionFor(shiftReturns(fields(), spread)) : null;
  // The bounds are differenced with the series they bound, so the ribbon is
  // the range around the month's change rather than around the running total.
  // The two cross in the month a holding is cashed in — the run that grew more
  // has more to sell, so its drop is the deeper one — and the ribbon pinches
  // there. That is the reading, not a fault in the drawing.
  const bands = specs.map((spec) => (ranged && BAND_KEYS.has(spec.key) ? {
    low: readingOf(lower, spec.key),
    high: readingOf(upper, spec.key),
    lowLabel: t('chart.bandLow'),
    highLabel: t('chart.bandHigh'),
  } : null));

  // A band that ran off the plot would be worse than no band, so the scale
  // counts its edges as points of their own.
  const references = specs.map((spec) => (spec.reference ? readingOf(projection, spec.reference) : null));
  const spanOf = (index) => [
    series[index],
    ...(bands[index] ? [bands[index].low, bands[index].high] : []),
    ...(references[index] ? [references[index]] : []),
  ];
  const shared = extentOf(specs.flatMap((spec, index) => (ownScaleOf(spec) ? [] : spanOf(index))));
  // One geometry for all three cards: the widest end-label decides the gutter,
  // so the small multiples are drawn to the same pixel scale and can be
  // compared by eye, not just by their axes.
  const labelPad = Math.max(...specs.flatMap((spec, index) => spanOf(index)).map(
    (points) => endLabelPad(formatAmount(points[points.length - 1].value)),
  ));

  ui.realToggle.setAttribute('aria-pressed', state.realMoney ? 'true' : 'false');
  ui.inflationFilter.hidden = !state.realMoney;
  ui.rangeToggle.setAttribute('aria-pressed', state.showRange ? 'true' : 'false');
  ui.spreadFilter.hidden = !state.showRange;
  // Worth saying outright: between them these change what every figure on the
  // page means, and a pressed button is easy to miss on a page this dense.
  const notes = [];
  if (state.realMoney && monthlyRate(state.inflation) > 0) {
    notes.push(t('filter.moneyNote', formatRate(state.inflation)));
  }
  if (ranged) notes.push(t('filter.rangeNote', formatRate(spread)));
  ui.moneyNote.hidden = notes.length === 0;
  ui.moneyNote.textContent = notes.join(' ');

  const labels = strategyLabels();
  bar.update(state.strategies, state.activeId, labels, t);
  jump.update(state.strategies, state.activeId, labels, t);
  const projectText = projectLabels();
  const shown = shownProjects();
  projectSwitch.update(shown, state.openProjectId, t, projectText);
  projectJump.update(shown, state.openProjectId, t, projectText);
  jump.setProjects(state.projects.length);
  if (ui.projectsDialog.open) projectList.update(shown, state.openProjectId, projectText, t);
  const comparing = state.strategies.length > 1;
  // The reader's own fields, deliberately NOT `projection.fields`: those are
  // the scheduled ones, and a field still waiting on a target that has not come
  // is not in them. Showing the projected list would make a row the reader can
  // still edit disappear out of the editor the moment its target stopped being
  // met, which is the one place it is most needed.
  list.update(fields(), fieldLabels(projection.schedule), t, { comparing });
  // Explains itself only while it has not been used: once something is synced,
  // the pressed links say it better than a paragraph does.
  ui.syncHint.hidden = !(comparing && !projection.fields.some((field) => field.synced));
  // Where the periods land only needs saying once something lands somewhere
  // other than every month.
  ui.periodNote.hidden = !projection.fields.some(
    (field) => field.periodMonths !== 1 && field.kind !== 'once',
  );
  // Only worth saying once something has a window to be read against.
  ui.windowNote.hidden = !projection.fields.some(
    (field) => field.startMonth || field.endMonth,
  );
  ui.viewTotal.setAttribute('aria-pressed', monthly ? 'false' : 'true');
  ui.viewMonthly.setAttribute('aria-pressed', monthly ? 'true' : 'false');
  // The key is moved, not just the text: `applyLanguage` relabels by whatever
  // `data-i18n` says, so a node whose key has moved comes back in the other
  // language already saying the right thing, with nothing here to remember.
  sayInstead(ui.chartsHeading, monthly ? 'charts.monthlyHeading' : 'charts.heading');
  sayInstead(ui.chartsScaleNote, monthly ? 'charts.monthlyNote' : 'charts.scaleNote');
  ui.charts.dataset.count = String(specs.length);
  // What went in, what it became, and what is left of the difference after
  // tax — the three figures that answer "is this actually working?".
  ui.contributedTile.hidden = !wantsInvestments;
  ui.contributedValue.textContent = hasInput ? formatAmount(projection.totals.contributed) : '—';
  ui.investedTile.hidden = !wantsInvestments;
  ui.investedValue.textContent = hasInput ? formatAmount(projection.totals.invested) : '—';
  ui.profitTile.hidden = !wantsInvestments;
  // `afterTax` clamps at 100 and `formatRate` at 1000, so a pasted 500 gave a
  // tile reading "after 500% tax" over a profit of 0. The label names the rate
  // the arithmetic actually used.
  ui.profitLabel.textContent = t('summary.profit', formatRate(Math.min(100, toRateNumber(state.tax) || 0)));
  ui.profitValue.textContent = hasInput ? formatAmount(projection.totals.profit) : '—';
  // The rate is applied to every plan, and the comparison's Profit column is
  // offered while any of them has an investment — so gating its control on the
  // plan on screen could hide the rate while the figures it produced were still
  // in the table, with nothing to say that switching plans would bring it back.
  ui.taxFilter.hidden = !projections.some(investsInside);
  ui.taxScope.hidden = !projections.some(investsInside);
  // The bottom line, and the only tile that names its own horizon: without an
  // investment it would repeat the hero to the cent, so it comes and goes with
  // the investment cards.
  // The balance sheet only shows the halves that exist. The hint is the one
  // that matters: a loan drags the total down until the thing it bought is
  // listed, and nothing else in the app would say so.
  const owing = hasDebt(projection);
  const owning = hasOwned(projection);
  ui.ownedTile.hidden = !owning;
  ui.ownedValue.textContent = hasInput ? formatAmount(projection.totals.owned) : '—';
  ui.debtTile.hidden = !owing;
  ui.debtValue.textContent = hasInput ? formatAmount(projection.totals.debt) : '—';
  ui.debtHint.hidden = !(owing && !owning);

  ui.worthTile.hidden = !(wantsInvestments || owing || owning);
  ui.worthLabel.textContent = t('summary.worth', projection.months);
  ui.worthValue.textContent = hasInput ? formatAmount(projection.totals.worth) : '—';

  // Worked out before the cards are drawn, because the rules go on them. It is
  // one pass over points that already exist: the model is not run again, and
  // could not be — a milestone is a read over its answer, never a rule in it.
  const rules = milestoneRules(projection);

  charts.forEach((chart, index) => {
    chart.instance.update({
      series: [
        {
          id: chart.key,
          label: chartWord(chart.key, 'series'),
          color: `var(${chart.colorVar})`,
          points: series[index],
          band: bands[index],
        },
        ...(references[index] ? [{
          id: chart.reference,
          label: chartWord(chart.reference, 'series'),
          // Neutral on purpose: a reference is not a category, so it takes no
          // slot in a palette that has none left to give.
          color: 'var(--text-muted)',
          points: references[index],
          dashed: true,
        }] : []),
      ],
      domain: ownScaleOf(specs[index]) ? extentOf(spanOf(index)) : shared,
      months: projection.months,
      // The same months on every card, in both readings: a month is a month
      // whether the card is showing a running total or what moved during it.
      rules,
      labelPad,
      isEmpty: !hasInput,
      emptyMessage: t('charts.empty'),
    });
  });

  renderMilestones(projection);
  renderSankey(projection);
  renderComparison(projections);
  // After the comparison, always: that call is what settles the column the
  // ranking is judged on. `renderRanking` says why at length.
  if (viewMode === 'advanced') renderRanking(projection, projections); else ui.rank.hidden = true;

  // Under a year the horizon restates the month count ("1 month · 1 mo"), so it
  // is only worth spelling out once there are years to spell out.
  const readout = projection.months < 12
    ? t('filter.readoutShort', projection.months)
    : t('filter.readout', projection.months, formatHorizon(projection.months, t));
  ui.monthsReadout.textContent = readout;
  ui.months.setAttribute('aria-valuetext', readout);

  for (const button of ui.presets) {
    const active = Number(button.dataset.months) === projection.months;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  // Here rather than at the five places that push a snapshot, so that the
  // control cannot get out of step with the stack: a render is what draws the
  // page from the state, and whether there is a way back is part of the state.
  renderUndo();
  paintSaveStatus();
  renderSummary(projection, hasInput);
  renderInterface(projection, projections);
}

/* ------------------------------------------------------------------ horizon */

// The slider's own max is the source of truth for the horizon: a stored value
// beyond it (a hand-edited store) is pulled back into range here rather than
// leaving the readout and the slider disagreeing.
function fillControls() {
  ui.months.value = String(state.months);
  state.months = toMonths(ui.months.value);
  ui.inflation.value = state.inflation;
  ui.spread.value = state.spread;
  ui.tax.value = state.tax;
}
fillControls();

for (const [input, key, max] of [[ui.tax, 'tax', 100], [ui.spread, 'spread', 1000], [ui.inflation, 'inflation', 1000]]) {
  const error = html('p', 'input-error', input.parentElement.parentElement);
  assumptionInputs.push(bindNumericInput(input, {
    options: () => ({ rate: true, max }), errorNode: error,
    message: (result) => t(result.reason === 'bounds' ? 'ui.inputBounds' : 'ui.inputInvalid'),
    onInput: (text) => { state[key] = text; persist(); render(); },
    onSettle: (text) => { state[key] = text.trim() ? formatTyped(annualPercent(text, 0, max)) : ''; input.value = state[key]; persist(); render(); },
    onValidity: inputValidity,
  }));
}
ui.rangeToggle.addEventListener('click', () => { state.showRange = !state.showRange; persist(); render(); });
ui.realToggle.addEventListener('click', () => { state.realMoney = !state.realMoney; persist(); render(); });

ui.months.addEventListener('input', () => {
  state.months = toMonths(ui.months.value);
  persist();
  render();
});

for (const button of ui.presets) {
  button.addEventListener('click', () => {
    state.months = toMonths(button.dataset.months);
    ui.months.value = String(state.months);
    persist();
    render();
  });
}

function setRail(open) {
  document.body.dataset.rail = open ? 'open' : 'closed';
  ui.railToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  ui.railToggle.setAttribute('aria-label', t(open ? 'inputs.fold' : 'inputs.unfold'));
  ui.railToggle.textContent = t(open ? 'inputs.fold' : 'inputs.unfold');
  // `hidden` rather than a class: it takes the form out of the accessibility
  // tree too, so there is no phantom list of rows behind the fold for anyone
  // reading the page with something other than their eyes.
  ui.inputsBody.hidden = !open;
  // Every focus target the commands reach lives in there, and focus left on a
  // hidden element lands nowhere. The button that did this is where the reader
  // is, so it is where the focus goes.
  if (!open && ui.inputsBody.contains(document.activeElement)) ui.railToggle.focus();
}

ui.railToggle.addEventListener('click', () => setRail(ui.inputsBody.hidden));

// Touch keeps the last tapped reading on screen; a tap anywhere else clears it.
// Both halves matter: the guard that holds a reading through the tap's own
// pointerleave would otherwise hold it for good, on the flow diagram as much as
// on the charts.
document.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'touch') return;
  const target = event.target instanceof Element ? event.target : null;
  if (sankey && !(target && target.closest('.sankey-svg'))) sankey.hideTip();
  if (target && target.closest('.chart-svg')) return;
  for (const chart of charts) chart.instance.setActive(null);
});

/* -------------------------------------------------------------------- about */

function renderAbout() {
  ui.aboutVersion.textContent = BUILD.version;
  ui.aboutBranch.textContent = BUILD.branch;
  ui.aboutCommit.textContent = BUILD.commit;
  ui.aboutDate.textContent = BUILD.date;

  // What the update row has to say right now, so opening the panel — or
  // changing language — never leaves a line standing from last time.
  ui.aboutUpdateNote.textContent = ui.updateToast.hidden ? '' : t('update.found');

  ui.aboutLog.textContent = '';
  const fragment = document.createDocumentFragment();
  for (const release of RELEASES) {
    const item = html('li', 'about-release', fragment);
    const head = html('p', 'about-release-head', item);
    html('span', 'about-version', head).textContent = release.version;
    html('span', 'about-when', head).textContent = release.date;
    // A commit is a handle for looking something up, so it stays as written
    // rather than being localised into a shape git would not recognise. The
    // newest release has none until the merge that publishes it creates one —
    // so the line says its hash is not recorded, which is what is missing.
    // Saying "not yet released" would call every deployed build unreleased,
    // three lines above marking that same entry as the one you are running.
    if (release.commit) html('code', 'about-commit-ref', head).textContent = release.commit;
    else html('span', 'about-when', head).textContent = t('about.unreleased');
    html('p', 'about-what', item).textContent = release[language] || release.en;
    // The one the reader is running, marked where they are looking for it.
    if (release.version === BUILD.version) item.setAttribute('aria-current', 'true');
  }
  ui.aboutLog.appendChild(fragment);
}

/**
 * Back to what a new reader sees. Every key is written from `defaultState()`,
 * the same one a first load uses, rather than a list kept in step by hand.
 *
 * Saved at once rather than through the debounce: this is the one edit where
 * a tab closed a quarter of a second later must not leave the old plans in
 * the store and the new ones on screen.
 */
function resetToDefaults() {
  // Before the assignment, because after it there is nothing left to photograph.
  // The confirm stays: undo is a way back while this tab is open and not after,
  // which is a smaller promise than the one that would let the question go.
  // The one move besides removing a project that throws a project away — every
  // project, in this case — so its snapshot carries the shelf as well. It is a
  // photograph of the project on screen, which is where undo puts the reader
  // back.
  // One project again, and the same one a new reader lands in — the button is
  // only worth having if "start again" means the whole device rather than the
  // corner of it you were standing in. Built rather than reloaded, because
  // `loadProjects` would find the shelf that is being thrown away — and built
  // *before* the snapshot, so the photograph can name the project this move
  // creates and take it away again if the reader changes their mind.
  const fresh = defaultState();
  delete fresh.fresh;
  const restarted = firstRunProjects(planOf(fresh), t);
  // Every project the restart makes is named, so undoing it takes all of them
  // away again rather than leaving the templates behind on a shelf the reader
  // has just asked to have back the way it was.
  checkpointShelf('reset', planOf(state), state.openProjectId,
    restarted.projects.map((project) => project.id));
  Object.assign(state, fresh);
  state.projects = restarted.projects;
  state.openProjectId = restarted.openProjectId;
  // Which column the comparison shows, and which of the two readings the cards
  // are in, are module state rather than stored state, so both survived the
  // reset: the button promises to land you exactly where a new reader lands,
  // and a first load has picked neither.
  metricChosen = false;
  monthly = false;
  // And the ranking is an answer about plans that are about to stop existing.
  forgetRanking();
  // As is the answer to "what would it take?", which was worked out about a
  // target that is about to stop existing too.
  forgetAsked();
  fillControls();
  save();
  render();
}

// Asked before it is done, and asked again from scratch each time the panel
// opens: a confirm left standing from last time is one a stray click answers.
function armReset(asking) {
  ui.aboutConfirm.hidden = !asking;
  // The whole row, not just the button: the line explaining what the button
  // does reads as orphaned once the button it describes is gone.
  ui.aboutResetRow.hidden = asking;
  // Focus lands on keeping what you have, so a stray Return does the safe
  // thing — and on the way back it lands on the button that reappears, since
  // hiding the one the reader just pressed would otherwise drop focus to the
  // document, outside a dialog that is still open. The `open` guard matters:
  // the About button disarms before `showModal`, and must not steal the focus
  // that opening the panel is about to place on Close.
  if (asking) ui.aboutResetNo.focus();
  else if (ui.aboutDialog.open) ui.aboutReset.focus();
}

ui.aboutOpen.addEventListener('click', () => {
  renderAbout();
  armReset(false);
  ui.aboutDialog.showModal();
});
ui.aboutReset.addEventListener('click', () => armReset(true));
ui.aboutResetNo.addEventListener('click', () => armReset(false));
ui.aboutResetYes.addEventListener('click', () => {
  resetToDefaults();
  // Closed so the answer is the app itself, changed, rather than a panel
  // saying it changed.
  ui.aboutDialog.close();
});
ui.aboutClose.addEventListener('click', () => ui.aboutDialog.close());

function closeOnBackdrop(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right
      || event.clientY < box.top || event.clientY > box.bottom;
    if (outside) dialog.close();
  });
}

closeOnBackdrop(ui.aboutDialog);

/* --------------------------------------------------------- interface choices */

function changeMode(next) {
  const chosen = viewModeOf(next);
  if (chosen === viewMode) return;
  if (chosen === 'simple') { advancedMonthly = monthly; monthly = false; document.querySelector('.summary-details').open = false; }
  else monthly = advancedMonthly;
  viewMode = chosen;
  document.body.dataset.mode = viewMode;
  writeStore(VIEW_MODE_KEY, viewMode);
  render();
}

function startGuided(kind) {
  if (kind === 'examples') {
    introPending = false; writeStore(INTRO_KEY, true); persist();
    window.setTimeout(openProjects, 0);
    return true;
  }
  const replacingExamples = introPending && freshWorkspace;
  if (!replacingExamples && state.projects.length >= MAX_PROJECTS) return false;
  const plan = guidedPlan(kind, t);
  const created = normalizeProject({ name: t(kind === 'compare' ? 'ui.compareProject' : kind === 'savings' ? 'ui.savings' : 'ui.budget') }, projectCoerce, true);
  if (replacingExamples) state.projects = [created];
  else {
    checkpointShelf('project', planOf(state), state.openProjectId, [created.id]);
    state.projects = addProject(parkOpen(state.projects, state.openProjectId, state), created);
  }
  state.openProjectId = created.id;
  Object.assign(state, plan);
  introPending = false; writeStore(INTRO_KEY, true);
  forgetRanking(); forgetAsked(); metricChosen = false;
  interfaceView.clearDrafts();
  setRail(true); fillControls(); persist(); render();
  window.setTimeout(() => { $('inputs').scrollIntoView({ block: 'start' }); list.focus(fields()[0]?.id); }, 0);
  return true;
}

function renderInterface(projection, projections) { interfaceView.update(projection, projections); }

/* ----------------------------------------------------------------- language */

let language = resolveLanguage();
let t = makeTranslator(language);

const bar = createStrategyBar({
  mount: ui.strategies,
  labels: strategyLabels(),
  t,
  onCommand: runStrategyCommand,
});

// The same switch, within reach from anywhere on the page. It watches the bar
// above and shows itself only once that one is gone, so the two are never both
// on screen asking to be told apart.
const jump = createStrategyJump({
  mount: ui.strategyJump,
  watch: bar.element,
  labels: strategyLabels(),
  t,
  onCommand: runStrategyCommand,
});

const projectSwitch = createProjectSwitch({
  mount: ui.inputsHeading,
  className: 'project-switch',
  onOpen: openProjects,
});

const projectJump = createProjectSwitch({
  mount: jump.lead,
  className: 'project-switch is-pinned',
  onOpen: openProjects,
});

const projectList = createProjectList({
  mount: ui.projectMount,
  labels: projectLabels(),
  t,
  onCommand: runProjectCommand,
});

function openProjects() {
  projectList.update(shownProjects(), state.openProjectId, projectLabels(), t);
  ui.projectsDialog.showModal();
}

ui.projectsClose.addEventListener('click', () => ui.projectsDialog.close());
closeOnBackdrop(ui.projectsDialog);

const list = createFieldList({
  mount: ui.fields,
  labels: fieldLabels(),
  t,
  mode: () => viewMode,
  counterparts: (id) => state.strategies.filter((strategy) => strategy.fields.some((field) => field.id === id && field.synced)).length,
  onCommand: runCommand,
  onValidity: inputValidity,
});

// The eight quantities are handed in rather than looked up: which of them a
// target may watch is the app's decision, and there is one list of them.
const milestoneList = createMilestoneList({
  mount: ui.milestoneMount,
  metrics: METRICS,
  labels: milestoneLabels(projectionFor(fields())),
  onCommand: runMilestoneCommand,
  onValidity: inputValidity,
  t,
});

const interfaceView = createInterfaceView({
  state, store: planStore, saver,
  translator: () => t, mode: () => viewMode, metric: () => simpleMetric,
  fresh: () => introPending && freshWorkspace,
  onMode: changeMode, onStart: startGuided, onValidity: inputValidity,
  readCurrency: () => readStore('finapp.currency.v1', ''),
  onCurrency: (value) => { writeStore('finapp.currency.v1', value); setDisplayCurrency(value); relabelCharts(); render(); },
  onData: () => setRail(true),
  onHorizon: (value) => { if (state.months === value) return; state.months = value; ui.months.value = String(value); persist(); render(); },
  onScenario: (id) => runStrategyCommand({ type: 'select', id }),
  onMetric: (key) => { simpleMetric = key; render(); },
  describeField: (field) => fieldLabels().saidFor(field),
  onAdvanced: (id) => {
    const owner = state.strategies.find((strategy) => strategy.fields.some((field) => field.id === id));
    if (owner && !fields().some((field) => field.id === id)) runStrategyCommand({ type: 'select', id: owner.id });
    changeMode('advanced'); setRail(true); list.openDetails(id);
  },
});
$('welcome').addEventListener('close', () => { if (introPending) { introPending = false; writeStore(INTRO_KEY, true); persist(); } });

function applyLanguage(next) {
  language = LANGUAGES.includes(next) ? next : 'en';
  t = makeTranslator(language);
  setFormatLocale(localeFor(language));

  document.documentElement.lang = t('html.lang');
  document.title = t('doc.title');
  if (ui.description) ui.description.setAttribute('content', t('doc.description'));
  // The manifest names the app in the install prompt, and a manifest has no
  // per-language strings — so point at the one written in this language. Both
  // declare the same id, start_url and scope, so it stays the same installed app.
  if (ui.manifestLink) ui.manifestLink.setAttribute('href', t('manifest.href'));

  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll('[data-i18n-aria]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  }
  for (const button of ui.presets) {
    button.textContent = t('filter.preset', Number(button.dataset.months) / 12);
  }
  renderAbout();

  ui.langLabel.textContent = t('lang.label');
  ui.langButton.setAttribute('aria-label', t('lang.aria'));

  // The fold's button carries no data-i18n, because its label alternates
  // between two keys depending on which way it would go — so it is relabelled
  // here, from whichever state it is already in. This is also the call that
  // sets the state the first time: the markup ships the form open, and this
  // runs at startup, once the dictionary exists.
  setRail(!ui.inputsBody.hidden);

  applyTheme(theme);
  relabelCharts();
  if (compareChart) buildCompareChart();
  if (sankey) buildSankey();
  render();
}

ui.langButton.addEventListener('click', () => {
  const next = LANGUAGES[(LANGUAGES.indexOf(language) + 1) % LANGUAGES.length];
  writeStore(LANG_KEY, next);
  applyLanguage(next);
});

/* -------------------------------------------------------------------- theme */

function applyTheme(choice) {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);

  const dark = choice === 'dark'
    || (choice === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  // The two <meta> tags live in the document head; the app still works without
  // them (an embedded or inlined copy of the markup, for instance).
  if (ui.themeColor) ui.themeColor.setAttribute('content', dark ? THEME_COLORS.dark : THEME_COLORS.light);
  ui.themeLabel.textContent = t(`theme.${choice}`);
  ui.themeButton.setAttribute('aria-label', t(`theme.aria.${choice}`));
}

const savedTheme = readStore(THEME_KEY, 'auto');
let theme = THEME_ORDER.includes(savedTheme) ? savedTheme : 'auto';

ui.themeButton.addEventListener('click', () => {
  theme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
  writeStore(THEME_KEY, theme);
  applyTheme(theme);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (theme === 'auto') applyTheme('auto');
});

/* ------------------------------------------------------------- install / SW */

let installEvent = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installEvent = event;
  ui.installButton.hidden = false;
});

ui.installButton.addEventListener('click', async () => {
  if (!installEvent) return;
  ui.installButton.hidden = true;
  const prompt = installEvent;
  installEvent = null;
  await prompt.prompt();
});

window.addEventListener('appinstalled', () => {
  installEvent = null;
  ui.installButton.hidden = true;
});

/* ------------------------------------------------------------ new versions */

/**
 * How stale the last look for a new worker may be before opening the app runs
 * another. Asking on every load would fetch `sw.js` far more often than a
 * static site ever changes; never asking would leave an installed app on the
 * build it was installed with, since nothing else here goes to the network.
 */
const UPDATE_INTERVAL = 60 * 60 * 1000;

let registered = null;
let reloadOnControllerChange = false;

/**
 * Offer the reader the build that is waiting.
 *
 * `worker` is the one waiting to take over, or null when there is none left to
 * wait for — the case in a second tab, where another tab has already accepted
 * the update and the new worker claimed every client at once.
 */
function offerReload(worker) {
  ui.updateToast.hidden = false;
  ui.updateReload.disabled = false;
  ui.aboutUpdateNote.textContent = t('update.found');
  ui.updateReload.onclick = () => {
    // `installed` is the only state with anything left to skip. A worker that
    // has since activated is already in charge of this page — the page is just
    // the old one — and one made redundant by a newer worker will never
    // activate. Posting to either does nothing, and did: the button greyed
    // itself out and the reload never came.
    if (!worker || worker.state !== 'installed') {
      window.location.reload();
      return;
    }
    ui.updateReload.disabled = true;
    reloadOnControllerChange = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
}

function watchForUpdate(registration) {
  if (registration.waiting && navigator.serviceWorker.controller) offerReload(registration.waiting);

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) offerReload(installing);
    });
  });
}

/**
 * Ask the server whether a newer worker exists, and remember when we asked.
 *
 * @returns {Promise<boolean>} whether a new version is on its way. True does
 *   not mean it has arrived: a worker found here is still installing, and
 *   `watchForUpdate` is what offers the reload once it is ready.
 */
async function lookForUpdate() {
  if (!registered) return false;
  writeStore(UPDATE_CHECKED_KEY, Date.now());
  await registered.update();
  return Boolean(registered.installing || registered.waiting);
}

/** Ask, but only if the last answer has gone stale. The time is kept in the
 *  store rather than in this tab, because when the device last asked is one
 *  fact however many tabs are open. */
function lookForUpdateIfStale() {
  const asked = Number(readStore(UPDATE_CHECKED_KEY, 0)) || 0;
  // A time in the future is a clock that has been put back, not a check that
  // has not happened yet: read it as stale rather than waiting for the clock.
  const since = Date.now() - asked;
  if (since >= 0 && since < UPDATE_INTERVAL) return;
  lookForUpdate().catch(() => { /* offline: the next opening asks again */ });
}

ui.aboutUpdate.addEventListener('click', async () => {
  ui.aboutUpdate.disabled = true;
  ui.aboutUpdateNote.textContent = t('update.checking');
  try {
    // Asked for by name, so it runs whatever the clock says.
    const coming = await lookForUpdate();
    // Unless `offerReload` overtook us, in which case it has said something
    // truer: the version is not on its way, it is here.
    if (ui.updateToast.hidden) {
      ui.aboutUpdateNote.textContent = coming ? t('update.coming') : t('update.current');
    }
  } catch {
    ui.aboutUpdateNote.textContent = t('update.unreachable');
  }
  ui.aboutUpdate.disabled = false;
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // Whether a worker was already in charge when this page loaded. A first visit
  // has none, and that worker claims the page the moment it activates — reading
  // that as a new version would offer a reload on every first visit.
  const wasControlled = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnControllerChange) {
      reloadOnControllerChange = false;
      window.location.reload();
      return;
    }
    // A worker this tab never asked for is now in charge: another tab accepted
    // the update. This page is the old build under the new worker, so it has
    // the same offer to make — with nothing left to skip, only a reload.
    if (wasControlled) offerReload(null);
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then((registration) => {
        registered = registration;
        // Until there is a worker, the button has nobody to ask.
        ui.aboutUpdateRow.hidden = false;
        watchForUpdate(registration);
        lookForUpdateIfStale();
      })
      .catch(() => { /* offline support is a bonus, never a blocker */ });
  });

  // An installed app is opened far more often than it is loaded: it is left
  // running for days and come back to. Coming back to it is an opening.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lookForUpdateIfStale();
  });
}

/* -------------------------------------------------------------------- share */

/** A decoded plan waiting on the reader's answer, or null while none is. */
let offered = null;
/** Whether taking it on would have to replace what is here, for want of room. */
let replacing = false;

function openShare() {
  // The link carries the project on screen, name and all — never the shelf.
  ui.shareLink.value = linkFor({ ...state, project: openProject() }, window.location.href);
  ui.shareCopy.disabled = !ui.shareLink.value;
  ui.shareSaid.textContent = '';
  ui.shareDialog.showModal();
  // Selected on opening, so the link is already in hand for a reader whose
  // browser refuses the clipboard, or who would rather use their own keyboard.
  ui.shareLink.select();
  copyShareLink();
}

async function copyShareLink() {
  if (!ui.shareLink.value) {
    ui.shareSaid.textContent = t('share.cannotEncode');
    return;
  }
  try {
    await navigator.clipboard.writeText(ui.shareLink.value);
    ui.shareSaid.textContent = t('share.copied');
  } catch {
    // No clipboard at all, or permission refused. The box above holds the link
    // and is already selected, so say what to do rather than say nothing and
    // leave the reader believing they have copied something.
    ui.shareSaid.textContent = t('share.copyYourself');
    ui.shareLink.select();
  }
}

ui.shareOpen.addEventListener('click', openShare);
ui.shareCopy.addEventListener('click', copyShareLink);
ui.shareClose.addEventListener('click', () => ui.shareDialog.close());
closeOnBackdrop(ui.shareDialog);

/** How many of a shared plan's strategies there is room for beside your own. */
function roomForShared() {
  return Math.max(0, MAX_STRATEGIES - state.strategies.length);
}

function adoptPlan(plan, { replacing } = {}) {
  // On every adoption, not only the one with no room. Adding somebody's plans
  // beside your own throws nothing away, but it does change the horizon, the
  // assumptions and every target on the page — and a reader who opened a link
  // to look at it should be able to put the page back the way it was without
  // having to remember what their own numbers were.
  // Stamped as shared here rather than where the link is unpacked: what a plan
  // was to whoever sent it is their business, and to whoever opens it, it
  // arrived from outside.
  const combined = mergeSharedPlan(planOf(state), plan, replacing);
  if (combined.error) return false;
  checkpoint('shared');
  const { strategies, activeId, milestones } = combined.plan;

  Object.assign(state, {
    strategies,
    // The first plan that arrived, so the answer to opening a link is the
    // shared plan on screen rather than a list the reader has to go looking in.
    activeId,
    months: toMonths(plan.months ?? DEFAULT_MONTHS),
    inflation: toRateText(plan.inflation),
    realMoney: plan.realMoney === true,
    spread: toRateText(plan.spread, DEFAULT_SPREAD),
    showRange: plan.showRange === true,
    tax: toRateText(plan.tax, DEFAULT_TAX),
    // The targets come with the plan for the reason the horizon does. They are
    // asked of every strategy at once, so there is one set of them however many
    // plans are on the device — and they are part of what somebody is sending:
    // "here is how I would buy it" usually means "and here is when it happens".
    milestones: normalizeMilestones(milestones, METRICS),
  });
  // Which column the comparison shows is module state rather than stored state,
  // so it would otherwise survive into somebody else's plan and pick a metric
  // they never chose.
  metricChosen = false;
  // The reading deliberately does not reset with it, and the asymmetry is the
  // point: a chosen metric is a claim about what a plan contains, and the
  // arriving plan may not contain it, whereas both readings exist for every
  // plan there is. Someone who switched to the per-month view in order to look
  // at a link is looking that way at the link too.
  //
  // The ranking is neither of those things: it is an answer about the fields
  // that were here, and after this the plan on screen is somebody else's. The
  // same goes for anything the solver was asked about them.
  forgetRanking();
  forgetAsked();
  fillControls();
  save();
  render();
}

/** What is in the plan, said before the reader decides whether to take it. */
function describePlan(plan) {
  const fields = plan.strategies.reduce((sum, strategy) => sum + strategy.fields.length, 0);
  const months = toMonths(plan.months ?? DEFAULT_MONTHS);
  return t('share.receivedWhat', plan.strategies.length, fields, formatHorizon(months, t));
}

/**
 * A plan in the address bar. It is asked about rather than opened, because
 * taking it on throws away whatever is on this device — and that is the
 * reader's decision, not the decision of whoever sent them the link.
 */
function offerPlanFromLink() {
  const packed = planInHash(window.location.hash);
  if (!packed) return;
  offered = decodePlan(packed);

  // Read once and taken out of the address either way: a reader who declines
  // must not be asked again by every refresh, and one who accepts must not have
  // a reload put the shared plan back over whatever they have done since.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  const broken = !offered;
  ui.sharedHeading.textContent = t(broken ? 'share.brokenHeading' : 'share.received');
  ui.sharedWhat.textContent = broken ? t('share.broken') : describePlan(offered);
  ui.sharedRoom.hidden = broken;
  ui.sharedAsk.hidden = broken;
  ui.sharedOpen.hidden = broken;
  // Offered while there is a shelf to put it on, and hidden when there is not —
  // never disabled, because a button that cannot be pressed is a question the
  // reader has to work out the answer to.
  ui.sharedNew.hidden = broken || state.projects.length >= MAX_PROJECTS;
  ui.sharedKeep.textContent = t(broken ? 'share.brokenClose' : 'share.receivedNo');

  if (!broken) {
    const room = roomForShared();
    const sent = offered.strategies.length;
    // Full up is the one case where opening a link costs something, so it is
    // the one case that says so and colours its button: with four plans already
    // here there is nowhere to put a fifth, and the reader's choice is between
    // replacing what they have and not reading the link at all.
    replacing = room === 0;
    ui.sharedRoom.textContent = replacing ? t('share.receivedNoRoom', MAX_STRATEGIES)
      : room >= sent ? t('share.receivedRoom')
        : t('share.receivedSome', room, sent, MAX_STRATEGIES);
    const mergeError = mergeSharedPlan(planOf(state), offered, replacing).error;
    ui.sharedOpen.disabled = Boolean(mergeError);
    if (mergeError) ui.sharedRoom.textContent = t('share.targetsFull');
    ui.sharedOpen.textContent = t(replacing ? 'share.receivedReplace' : 'share.receivedYes');
    ui.sharedOpen.classList.toggle('is-grave', replacing);
    // The line about what is left alone is only true while nothing is being
    // thrown away; with no room, the line above it says the opposite outright.
    ui.sharedAsk.hidden = replacing;
  }
  ui.sharedDialog.showModal();
  // Focus lands on keeping what you have, so a stray Return does the safe
  // thing — the rule "Start again" follows, for the same reason.
  ui.sharedKeep.focus();
}

function adoptAsProject(plan) {
  const created = normalizeProject({
    name: typeof plan.name === 'string' ? plan.name : '',
    nameKey: typeof plan.nameKey === 'string' ? plan.nameKey : '',
  }, projectCoerce, false);
  // The third move that changes which projects there are, and the only one that
  // *adds*. Its undo has to take the stranger's project away again and stand the
  // reader back in their own, so the snapshot carries the shelf and the id of
  // the project about to be made.
  checkpointShelf('shared', planOf(state), state.openProjectId, [created.id]);
  state.projects = addProject(
    parkOpen(state.projects, state.openProjectId, state), created,
  );
  state.openProjectId = created.id;
  Object.assign(state, normalizePlan({
    strategies: markShared(plan.strategies),
    months: plan.months,
    milestones: plan.milestones,
  }, projectCoerce));
  state.projects = state.projects.map(
    (project) => (project.id === created.id ? { ...project, plan: null } : project),
  );
  // The two toggles are the reader's way of looking and travel with a link
  // today, so they keep doing exactly that.
  state.realMoney = plan.realMoney === true;
  state.showRange = plan.showRange === true;
  metricChosen = false;
  forgetRanking();
  forgetAsked();
  fillControls();
  save();
  render();
}

ui.sharedNew.addEventListener('click', () => {
  if (offered) adoptAsProject(offered);
  offered = null;
  ui.sharedDialog.close();
});

ui.sharedOpen.addEventListener('click', () => {
  if (offered) adoptPlan(offered, { replacing });
  offered = null;
  // Closed, so the answer is the app itself showing the plan rather than a
  // panel saying it has.
  ui.sharedDialog.close();
});
ui.sharedKeep.addEventListener('click', () => ui.sharedDialog.close());
// Escape and the backdrop are declining too, which is the safe half of the
// question and therefore the right thing for them to mean.
ui.sharedDialog.addEventListener('close', () => { offered = null; });
closeOnBackdrop(ui.sharedDialog);

applyLanguage(language);

// A link pasted into the address bar of a tab already showing the app changes
// the fragment without loading anything, so the question has to be asked on the
// change as well as on the load. `replaceState`, which is how the link is taken
// back out again, does not raise this — so clearing the address cannot set the
// question off a second time.
window.addEventListener('hashchange', () => {
  if (ui.sharedDialog.open) return;
  offerPlanFromLink();
});

// After the language, so the question is asked in the reader's own.
offerPlanFromLink();

if (introPending && !planInHash(window.location.hash)) interfaceView.showWelcome();
else if (introPending) { introPending = false; writeStore(INTRO_KEY, true); }
