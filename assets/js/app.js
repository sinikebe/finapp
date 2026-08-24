/**
 * app.js — wiring. Holds the reader's fields and horizon, runs the projection,
 * pushes it into three charts that share one scale, and keeps the whole thing
 * usable offline.
 *
 * The app knows nothing about "income" and "rent" as such: they are two
 * ordinary fields the reader can rename, retype, duplicate or delete like any
 * other. Everything here works from the list, never from a named field.
 */

import {
  project, inTodaysMoney, shiftReturns, seriesOf, extentOf,
  hasAmounts, hasInvestments, hasDebt, hasOwned,
  loanPayment, loanInterest, monthlyRate, toAmount, toMonths,
} from './projection.js';
import {
  addField, updateField, duplicateField, removeField, neighbourOf,
  normalizeFields, defaultFields, migrateLegacyInputs,
} from './fields.js';
import {
  formatAmount, formatCompact, formatMonth, formatHorizon, formatRate, setFormatLocale,
} from './format.js';
import { html } from './dom.js';
import { createLineChart, endLabelPad } from './chart.js';
import { createFieldList } from './field-list.js';
import { createStrategyBar } from './strategy-bar.js';
import {
  updateStrategy, duplicateStrategy, removeStrategy,
  neighbourOf as strategyNeighbourOf, normalizeStrategies, activeIdOf, nameOf,
  migrateFields,
} from './strategies.js';
import { LANGUAGES, detectLanguage, localeFor, makeTranslator } from './i18n.js';

const STATE_KEY = 'finapp.state.v3';
const LEGACY_FIELDS_KEY = 'finapp.state.v2';
const LEGACY_INPUT_KEY = 'finapp.inputs.v1';
const THEME_KEY = 'finapp.theme.v1';
const LANG_KEY = 'finapp.language.v1';
const THEME_ORDER = ['auto', 'light', 'dark'];
const THEME_COLORS = { light: '#f9f9f7', dark: '#0d0d0d' };
const DEFAULT_MONTHS = 24;
/** Enough that pressing the toggle visibly does something, low enough to be a
 *  reasonable thing to assume on the reader's behalf. They can change it. */
const DEFAULT_INFLATION = '2';
/** How far returns are moved for the pessimistic and hopeful runs, in points. */
const DEFAULT_SPREAD = '3';
/** The series a return can move. The flows are fixed amounts, so a range on
 *  them would be a range around nothing. */
const BAND_KEYS = new Set(['invested', 'worth']);

const $ = (id) => document.getElementById(id);

const ui = {
  fields: $('fields'),
  strategies: $('strategies'),
  compare: $('compare'),
  compareNote: $('compare-note'),
  compareMetrics: $('compare-metrics'),
  compareChart: $('compare-chart'),
  compareCaption: $('compare-table-caption'),
  compareHead: $('compare-head'),
  compareBody: $('compare-body'),
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
  realToggle: $('real-toggle'),
  inflationFilter: $('inflation-filter'),
  inflation: $('inflation'),
  moneyNote: $('money-note'),
  rangeToggle: $('range-toggle'),
  spreadFilter: $('spread-filter'),
  spread: $('spread'),
  worthTile: $('worth-tile'),
  worthLabel: $('worth-label'),
  worthValue: $('worth-value'),
  chartsNote: $('charts-note'),
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
  updateToast: $('update-toast'),
  updateReload: $('update-reload'),
};

const STATUS_ICONS = {
  // Both status cues ship as icon + label, never colour alone.
  surplus: 'M4.5 10.5 8 6.5l3.5 4z',
  shortfall: 'M8 3.2v6.2M8 12v.4',
};

/* ------------------------------------------------------------------ storage */

function readStore(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** @returns {boolean} whether the value is actually stored. */
function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    /* private mode, or a full quota — the app still works, it just forgets. */
    return false;
  }
}

function dropStore(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to do: the app never depended on it */
  }
}

/* -------------------------------------------------------------------- state */

/** Inflation as typed, kept as text like a field's rate so a half-typed
 *  "2." survives the keystroke that follows it. */
function toRateText(value, fallback = DEFAULT_INFLATION) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value : fallback;
}

/**
 * The stored shape is `{ strategies, activeId, months, inflation, realMoney }`.
 * The last two arrived later and are simply absent from an older store, which
 * reads as the defaults — no migration, because nothing changed shape. Two
 * older shapes are
 * carried over once and retired, so nobody loses what they had entered: a bare
 * list of fields from before strategies, and before that a single income and a
 * single rent.
 */
function loadState() {
  const saved = readStore(STATE_KEY, null);
  if (saved && typeof saved === 'object' && Array.isArray(saved.strategies)) {
    const strategies = normalizeStrategies(saved.strategies);
    return {
      strategies,
      activeId: activeIdOf(strategies, saved.activeId),
      months: toMonths(saved.months ?? DEFAULT_MONTHS),
      inflation: toRateText(saved.inflation),
      realMoney: saved.realMoney === true,
      spread: toRateText(saved.spread, DEFAULT_SPREAD),
      showRange: saved.showRange === true,
    };
  }

  // A store from before strategies: a bare list of fields.
  const withFields = readStore(LEGACY_FIELDS_KEY, null);
  if (withFields && typeof withFields === 'object' && Array.isArray(withFields.fields)) {
    return adopt(migrateFields(normalizeFields(withFields.fields)), withFields.months, LEGACY_FIELDS_KEY);
  }

  // And from before fields: a single income and a single rent.
  const legacy = readStore(LEGACY_INPUT_KEY, null);
  if (legacy && typeof legacy === 'object') {
    return adopt(migrateFields(migrateLegacyInputs(legacy)), legacy.months, LEGACY_INPUT_KEY);
  }

  const strategies = migrateFields(defaultFields());
  return {
    strategies,
    activeId: strategies[0].id,
    months: DEFAULT_MONTHS,
    inflation: DEFAULT_INFLATION,
    realMoney: false,
    spread: DEFAULT_SPREAD,
    showRange: false,
  };
}

/**
 * Take an older store's contents into the current shape. The old key is only
 * retired once the new one is genuinely written: a failed write plus an eager
 * delete would lose the reader's numbers for good.
 */
function adopt(strategies, months, oldKey) {
  const next = {
    strategies,
    activeId: strategies[0].id,
    months: toMonths(months ?? DEFAULT_MONTHS),
    inflation: DEFAULT_INFLATION,
    realMoney: false,
    spread: DEFAULT_SPREAD,
    showRange: false,
  };
  if (writeStore(STATE_KEY, next)) dropStore(oldKey);
  return next;
}

const state = loadState();

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

let saveTimer = 0;

function save() {
  window.clearTimeout(saveTimer);
  saveTimer = 0;
  writeStore(STATE_KEY, {
    strategies: state.strategies,
    activeId: state.activeId,
    months: state.months,
    inflation: state.inflation,
    realMoney: state.realMoney,
    spread: state.spread,
    showRange: state.showRange,
  });
}

function persist() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 250);
}

// A tab can be closed or backgrounded inside the debounce window; the last edit
// must not be the one that gets lost.
for (const event of ['pagehide', 'beforeunload']) {
  window.addEventListener(event, () => { if (saveTimer) save(); });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saveTimer) save();
});

// Two tabs, one store. The tab the reader is actually using keeps its own
// state; an idle one adopts what the other wrote rather than sitting on stale
// numbers and overwriting them later.
window.addEventListener('storage', (event) => {
  if (event.key !== STATE_KEY || !event.newValue) return;
  // Never pull the rug out from under someone typing here, and leave the tab
  // in the foreground alone — it is the one the reader is working in.
  const editingHere = document.activeElement instanceof Element
    && document.activeElement.closest('.field-list, .strategy-bar');
  if (editingHere) return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    const incoming = JSON.parse(event.newValue);
    if (!incoming || !Array.isArray(incoming.strategies)) return;
    state.strategies = normalizeStrategies(incoming.strategies);
    state.activeId = activeIdOf(state.strategies, incoming.activeId);
    state.months = toMonths(incoming.months ?? DEFAULT_MONTHS);
    state.inflation = toRateText(incoming.inflation);
    state.realMoney = incoming.realMoney === true;
    state.spread = toRateText(incoming.spread, DEFAULT_SPREAD);
    state.showRange = incoming.showRange === true;
    ui.months.value = String(state.months);
    ui.inflation.value = state.inflation;
    ui.spread.value = state.spread;
    render();
  } catch {
    /* another tab wrote something unreadable — keep what we have */
  }
});

/* ------------------------------------------------------------------- charts */

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
    when: (projection) => hasInvestments(projection) || hasDebt(projection) || hasOwned(projection),
    // Deliberately on the flows' shared scale rather than its own: the whole
    // point of the card is the gap between the total and the net beside it,
    // which is what the investments have added. Its own scale would hide it.
  },
  {
    id: 'chart-invested',
    key: 'invested',
    colorVar: '--series-invested',
    when: hasInvestments,
    // A balance is not a cumulative flow: put it on the flows' scale and a
    // realistic pot reads as a flat line along the axis. Its own scale makes it
    // readable, and the note under the charts says which card is on its own.
    ownScale: true,
  },
];

let charts = [];
/** Which cards were built last, so they are rebuilt only when the set changes. */
let chartsBuilt = '';

function activeCharts(projection) {
  return CHARTS.filter((spec) => !spec.when || spec.when(projection));
}

function buildCharts(specs) {
  for (const chart of charts) chart.instance.destroy();
  ui.charts.textContent = '';
  chartsBuilt = specs.map((spec) => spec.id).join(',');
  charts = specs.map((spec) => {
    const title = t(`chart.${spec.key}.title`);
    return {
      ...spec,
      instance: createLineChart({
        mount: ui.charts,
        id: spec.id,
        title,
        description: t(`chart.${spec.key}.description`),
        labels: {
          showTable: t('chart.showTable'),
          hideTable: t('chart.hideTable'),
          tableCaption: t('chart.tableCaption', title),
          monthColumn: t('chart.monthColumn'),
          ariaLabel: (months, endValue, count) => t('chart.aria', title, months, endValue, count),
          reading: (month, value) => t('chart.reading', month, value),
        },
        formatValue: formatAmount,
        formatTick: formatCompact,
        formatMonth: (month) => formatMonth(month, t),
        onHover: (index) => {
          for (const chart of charts) chart.instance.setActive(index);
        },
      }),
    };
  });
}

/* --------------------------------------------------------------- comparing */

/** Which quantity the comparison chart is showing. */
const METRICS = ['net', 'worth', 'income', 'expenses', 'invested', 'owned', 'debt'];

/** Metrics that say nothing until the thing they measure exists. */
const CONDITIONAL_METRICS = {
  worth: (projections) => projections.some((p) => hasInvestments(p) || hasDebt(p) || hasOwned(p)),
  invested: (projections) => projections.some((p) => hasInvestments(p)),
  owned: (projections) => projections.some((p) => hasOwned(p)),
  debt: (projections) => projections.some((p) => hasDebt(p)),
};
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
  if (!metricChosen) metric = wanted.includes('worth') ? 'worth' : 'net';
  if (!wanted.includes(metric)) metric = 'net';

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
    ...(shows('invested') ? [{ key: 'invested', total: (p) => p.totals.invested }] : []),
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
  deltaHead.textContent = t('compare.deltaColumn', t(`compare.metric.${shows('worth') ? 'worth' : 'net'}`));

  // Judged on the total, not the net: a strategy that puts everything into an
  // investment keeps less cash and would read as "behind" while being ahead.
  // Without an investment the two are equal to the cent, so nothing changes.
  const baseline = projections[0].totals.worth;
  ui.compareBody.textContent = '';
  state.strategies.forEach((strategy, index) => {
    const row = html('tr', null, ui.compareBody);
    if (strategy.id === state.activeId) row.classList.add('is-active');
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
function projectionFor(planFields) {
  const projection = project({ fields: planFields, months: state.months });
  return state.realMoney ? inTodaysMoney(projection, state.inflation) : projection;
}

/** Cents, so a difference of two rounded totals doesn't show float noise. */
function roundToCent(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function renderComparison(projections) {
  const comparing = state.strategies.length > 1;
  ui.compare.hidden = !comparing;
  if (!comparing) return;

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
    ui.compareNote.textContent = t(
      'compare.note',
      nameOf(best.strategy, best.index, t),
      formatAmount(best.worth),
      state.months,
    );
  }, 500);
}

let compareNoteTimer = 0;

/* --------------------------------------------------------------- field list */

function fieldLabels() {
  return {
    name: t('field.name'),
    namePlaceholder: t('field.namePlaceholder'),
    direction: t('field.direction'),
    amount: t('field.amount'),
    period: t('field.period'),
    periodName: (months) => t(`field.period.${months}`),
    kind: t('field.kind'),
    kindName: (kind) => t(`field.kind.${kind}`),
    amountFor: (kind) => t(`field.amount.${kind}`),
    rateFor: (kind) => t(`field.rate.${kind}`),
    ratePlaceholder: t('field.ratePlaceholder'),
    term: t('field.term'),
    rateUnit: t('field.rateUnit'),
    rateUnitShort: t('field.rateUnitShort'),
    termUnit: t('field.termUnit'),
    termUnitShort: t('field.termUnitShort'),
    loanSummary: (field) => t(
      'field.loanSummary',
      formatAmount(loanPayment(field.amount, field.annualRate, field.termMonths)),
      field.termMonths,
      formatAmount(loanInterest(field)),
    ),
    income: t('field.income'),
    expense: t('field.expense'),
    untitled: t('field.untitled'),
    add: t('field.add'),
    empty: t('fields.empty'),
    duplicateNamed: (name) => t('field.duplicateNamed', name),
    removeNamed: (name) => t('field.removeNamed', name),
    directionNamed: (name) => t('field.directionNamed', name),
    amountNamed: (name) => t('field.amountNamed', name),
  };
}

/**
 * A name box is seeded with the field's translated default, so a name equal to
 * that default means "still the default" — not a name of the reader's own.
 * Without this, tabbing through the box (or typing the same word and never
 * leaving it) would pin the current language's word forever.
 */
function normalizeLabelPatch(patch, id) {
  if (!('label' in patch)) return patch;
  const field = fields().find((entry) => entry.id === id);
  const dictionaryName = field && field.labelKey ? t(field.labelKey) : '';
  return String(patch.label).trim() === dictionaryName ? { ...patch, label: '' } : patch;
}

function strategyLabels() {
  return {
    tabsAria: t('strategy.tabsAria'),
    nameAria: t('strategy.nameAria'),
    namePlaceholder: t('strategy.namePlaceholder'),
    add: t('strategy.add'),
    addFirst: t('strategy.addFirst'),
    switchTo: (name) => t('strategy.switchTo', name),
    removeNamed: (name) => t('strategy.removeNamed', name),
  };
}

/**
 * Every edit the strategy bar can ask for. Adding one copies what is on screen
 * — comparing almost always means "the same, but…", and starting from a blank
 * list would mean typing everything twice.
 */
function runStrategyCommand(command) {
  switch (command.type) {
    case 'select':
      state.activeId = activeIdOf(state.strategies, command.id);
      break;

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
      const neighbour = strategyNeighbourOf(state.strategies, state.activeId);
      state.strategies = removeStrategy(state.strategies, state.activeId);
      state.activeId = activeIdOf(state.strategies, neighbour);
      break;
    }

    default:
      return;
  }

  persist();
  render();
}

/** Every edit the list can ask for. Each one ends in the same place: new
 *  fields, saved, redrawn, with focus left where the reader expects it. */
function runCommand(command) {
  switch (command.type) {
    case 'update':
      setActiveFields(updateField(fields(), command.id, normalizeLabelPatch(command.patch, command.id)));
      break;

    case 'settle': {
      // The reader left a box: show what the projection will actually use —
      // the rounded amount, the trimmed name, or the default name restored.
      const patch = { ...command.patch };
      if ('amount' in patch) {
        const amount = toAmount(patch.amount);
        patch.amount = amount ? String(amount) : '';
      }
      setActiveFields(updateField(fields(), command.id, normalizeLabelPatch(patch, command.id)));
      break;
    }

    case 'add': {
      setActiveFields(addField(fields()));
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
      const neighbour = neighbourOf(fields(), command.id);
      setActiveFields(removeField(fields(), command.id));
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
  ui.heroLabel.textContent = t('summary.heroLabel', projection.months);
  // Exact amounts, not rounded ones: whole-unit rounding let the tiles and the
  // hero disagree by a unit (24,010 − 0 shown against a net of 24,009).
  ui.heroValue.textContent = hasInput ? formatAmount(projection.totals.net) : '—';
  ui.totalIncome.textContent = hasInput ? formatAmount(projection.totals.income) : '—';
  ui.totalExpenses.textContent = hasInput ? formatAmount(projection.totals.expenses) : '—';
  ui.monthlyNet.textContent = hasInput ? formatAmount(projection.averages.net) : '—';

  ui.summary.classList.toggle('is-empty', !hasInput);

  const shortfall = projection.averages.net < 0;
  ui.heroChip.hidden = !hasInput || projection.averages.net === 0;
  ui.heroChip.classList.toggle('is-critical', shortfall);
  ui.heroChip.classList.toggle('is-good', !shortfall);
  ui.heroChipText.textContent = shortfall
    ? t('summary.shortfall', formatAmount(Math.abs(projection.averages.net)))
    : t('summary.surplus', formatAmount(projection.averages.net));
  ui.chipIconPath.setAttribute('d', shortfall ? STATUS_ICONS.shortfall : STATUS_ICONS.surplus);

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

  // The conditional cards come and go with the fields, so they are rebuilt
  // only when the set actually changes rather than on every keystroke.
  const wantsInvestments = hasInvestments(projection);
  const specs = activeCharts(projection);
  if (specs.map((spec) => spec.id).join(',') !== chartsBuilt) buildCharts(specs);
  const series = specs.map((spec) => seriesOf(projection, spec.key));

  // The two runs behind a band: the same plan with every return moved down and
  // up. Only worth computing when something actually depends on a return.
  const spread = Number.parseFloat(state.spread);
  const ranged = state.showRange && Number.isFinite(spread) && spread > 0
    && (hasInvestments(projection) || hasOwned(projection));
  const lower = ranged ? projectionFor(shiftReturns(projection.fields, -spread)) : null;
  const upper = ranged ? projectionFor(shiftReturns(projection.fields, spread)) : null;
  const bands = specs.map((spec) => (ranged && BAND_KEYS.has(spec.key) ? {
    low: seriesOf(lower, spec.key),
    high: seriesOf(upper, spec.key),
    lowLabel: t('chart.bandLow'),
    highLabel: t('chart.bandHigh'),
  } : null));

  // A band that ran off the plot would be worse than no band, so the scale
  // counts its edges as points of their own.
  const spanOf = (index) => (bands[index]
    ? [series[index], bands[index].low, bands[index].high]
    : [series[index]]);
  const shared = extentOf(specs.flatMap((spec, index) => (spec.ownScale ? [] : spanOf(index))));
  // One geometry for all three cards: the widest end-label decides the gutter,
  // so the small multiples are drawn to the same pixel scale and can be
  // compared by eye, not just by their axes.
  const labelPad = Math.max(...series.map(
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

  bar.update(state.strategies, state.activeId, strategyLabels(), t);
  list.update(projection.fields, fieldLabels(), t);
  // Where the periods land only needs saying once something lands somewhere
  // other than every month.
  ui.periodNote.hidden = !projection.fields.some((field) => field.periodMonths !== 1);
  ui.charts.dataset.count = String(specs.length);
  ui.investedTile.hidden = !wantsInvestments;
  ui.investedValue.textContent = hasInput ? formatAmount(projection.totals.invested) : '—';
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

  charts.forEach((chart, index) => {
    chart.instance.update({
      series: [{
        id: chart.key,
        label: t(`chart.${chart.key}.series`),
        color: `var(${chart.colorVar})`,
        points: series[index],
        band: bands[index],
      }],
      domain: specs[index].ownScale ? extentOf(spanOf(index)) : shared,
      months: projection.months,
      labelPad,
      isEmpty: !hasInput,
      emptyMessage: t('charts.empty'),
    });
  });

  renderComparison(projections);

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

  renderSummary(projection, hasInput);
}

/* ------------------------------------------------------------------ horizon */

// The slider's own max is the source of truth for the horizon: a stored value
// beyond it (a hand-edited store) is pulled back into range here rather than
// leaving the readout and the slider disagreeing.
ui.months.value = String(state.months);
state.months = toMonths(ui.months.value);
ui.inflation.value = state.inflation;
ui.spread.value = state.spread;

ui.rangeToggle.addEventListener('click', () => {
  state.showRange = !state.showRange;
  persist();
  render();
});

ui.spread.addEventListener('input', () => {
  state.spread = ui.spread.value;
  persist();
  render();
});

ui.realToggle.addEventListener('click', () => {
  state.realMoney = !state.realMoney;
  persist();
  render();
});

ui.inflation.addEventListener('input', () => {
  state.inflation = ui.inflation.value;
  persist();
  render();
});

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

// Touch keeps the last tapped reading on screen; a tap anywhere else clears it.
document.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'touch') return;
  if (event.target instanceof Element && event.target.closest('.chart-svg')) return;
  for (const chart of charts) chart.instance.setActive(null);
});

/* ----------------------------------------------------------------- language */

const savedLanguage = readStore(LANG_KEY, null);
let language = LANGUAGES.includes(savedLanguage) ? savedLanguage : detectLanguage();
let t = makeTranslator(language);

const bar = createStrategyBar({
  mount: ui.strategies,
  labels: strategyLabels(),
  t,
  onCommand: runStrategyCommand,
});

const list = createFieldList({
  mount: ui.fields,
  labels: fieldLabels(),
  t,
  onCommand: runCommand,
});

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

  ui.langLabel.textContent = t('lang.label');
  ui.langButton.setAttribute('aria-label', t('lang.aria'));

  applyTheme(theme);
  // The language owns every label on a card, so they are rebuilt wholesale;
  // `render` puts the data back a moment later.
  buildCharts(activeCharts(project({ fields: fields(), months: state.months })));
  if (compareChart) buildCompareChart();
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

let reloadOnControllerChange = false;

function watchForUpdate(registration) {
  const offerReload = (worker) => {
    ui.updateToast.hidden = false;
    ui.updateReload.onclick = () => {
      ui.updateReload.disabled = true;
      reloadOnControllerChange = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    };
  };

  if (registration.waiting && navigator.serviceWorker.controller) offerReload(registration.waiting);

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) offerReload(installing);
    });
  });
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // The first worker claims this page as soon as it activates; reloading on that
  // would flash the app on every first visit. Only the reader's own "Reload"
  // click earns a reload.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadOnControllerChange) return;
    reloadOnControllerChange = false;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then((registration) => {
        watchForUpdate(registration);
        // The shell is served from the cache, so ask explicitly whether a newer
        // worker exists rather than waiting for the browser's own schedule.
        registration.update().catch(() => {});
      })
      .catch(() => { /* offline support is a bonus, never a blocker */ });
  });
}

applyLanguage(language);
