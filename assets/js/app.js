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
  project, seriesOf, extentOf, hasAmounts, toAmount, toMonths,
} from './projection.js';
import {
  addField, updateField, duplicateField, removeField, neighbourOf,
  normalizeFields, defaultFields, migrateLegacyInputs,
} from './fields.js';
import {
  formatAmount, formatCompact, formatMonth, formatHorizon, setFormatLocale,
} from './format.js';
import { createLineChart, endLabelPad } from './chart.js';
import { createFieldList } from './field-list.js';
import { LANGUAGES, detectLanguage, localeFor, makeTranslator } from './i18n.js';

const STATE_KEY = 'finapp.state.v2';
const LEGACY_INPUT_KEY = 'finapp.inputs.v1';
const THEME_KEY = 'finapp.theme.v1';
const LANG_KEY = 'finapp.language.v1';
const THEME_ORDER = ['auto', 'light', 'dark'];
const THEME_COLORS = { light: '#f9f9f7', dark: '#0d0d0d' };
const DEFAULT_MONTHS = 24;

const $ = (id) => document.getElementById(id);

const ui = {
  fields: $('fields'),
  months: $('months'),
  monthsReadout: $('months-readout'),
  presets: Array.from(document.querySelectorAll('.preset')),
  heroLabel: $('hero-label'),
  heroValue: $('hero-value'),
  heroChip: $('hero-chip'),
  heroChipText: $('hero-chip-text'),
  chipIconPath: $('chip-icon-path'),
  totalIncome: $('total-income'),
  totalExpenses: $('total-expenses'),
  monthlyNet: $('monthly-net'),
  chartsNote: $('charts-note'),
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

/**
 * The stored shape is `{ fields, months }`. A store from before fields existed
 * held a single income and a single rent; it is carried over once and retired,
 * so nobody loses the numbers they had typed.
 */
function loadState() {
  const saved = readStore(STATE_KEY, null);
  if (saved && typeof saved === 'object' && Array.isArray(saved.fields)) {
    return { fields: normalizeFields(saved.fields), months: toMonths(saved.months ?? DEFAULT_MONTHS) };
  }

  const legacy = readStore(LEGACY_INPUT_KEY, null);
  if (legacy && typeof legacy === 'object') {
    const migrated = {
      fields: migrateLegacyInputs(legacy),
      months: toMonths(legacy.months ?? DEFAULT_MONTHS),
    };
    // Only retire the old store once the new one is genuinely written: a failed
    // write plus an eager delete would lose the reader's numbers for good.
    if (writeStore(STATE_KEY, migrated)) dropStore(LEGACY_INPUT_KEY);
    return migrated;
  }

  return { fields: defaultFields(), months: DEFAULT_MONTHS };
}

const state = loadState();

let saveTimer = 0;

function save() {
  window.clearTimeout(saveTimer);
  saveTimer = 0;
  writeStore(STATE_KEY, { fields: state.fields, months: state.months });
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
    && document.activeElement.closest('.field-list');
  if (editingHere) return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    const incoming = JSON.parse(event.newValue);
    if (!incoming || !Array.isArray(incoming.fields)) return;
    state.fields = normalizeFields(incoming.fields);
    state.months = toMonths(incoming.months ?? DEFAULT_MONTHS);
    ui.months.value = String(state.months);
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
];

let charts = [];

function buildCharts() {
  for (const chart of charts) chart.instance.destroy();
  ui.charts.textContent = '';
  charts = CHARTS.map((spec) => {
    const title = t(`chart.${spec.key}.title`);
    return {
      ...spec,
      instance: createLineChart({
        mount: ui.charts,
        id: spec.id,
        title,
        description: t(`chart.${spec.key}.description`),
        seriesLabel: t(`chart.${spec.key}.series`),
        colorVar: spec.colorVar,
        labels: {
          showTable: t('chart.showTable'),
          hideTable: t('chart.hideTable'),
          tableCaption: t('chart.tableCaption', title),
          monthColumn: t('chart.monthColumn'),
          ariaLabel: (months, endValue) => t('chart.aria', title, months, endValue),
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

/* --------------------------------------------------------------- field list */

function fieldLabels() {
  return {
    name: t('field.name'),
    namePlaceholder: t('field.namePlaceholder'),
    direction: t('field.direction'),
    amount: t('field.amount'),
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

/** Every edit the list can ask for. Each one ends in the same place: new
 *  fields, saved, redrawn, with focus left where the reader expects it. */
function runCommand(command) {
  switch (command.type) {
    case 'update':
      state.fields = updateField(state.fields, command.id, command.patch);
      break;

    case 'settle': {
      // The reader left a box: show what the projection will actually use —
      // the rounded amount, the trimmed name, or the default name restored.
      const patch = { ...command.patch };
      if ('amount' in patch) {
        const amount = toAmount(patch.amount);
        patch.amount = amount ? String(amount) : '';
      }
      if ('label' in patch) {
        // The box is seeded with the field's translated default, so merely
        // tabbing through it would otherwise freeze that word as a name of the
        // reader's own — and the field would stop following the language.
        const field = state.fields.find((entry) => entry.id === command.id);
        const dictionaryName = field && field.labelKey ? t(field.labelKey) : '';
        if (patch.label.trim() === dictionaryName) patch.label = '';
      }
      state.fields = updateField(state.fields, command.id, patch);
      break;
    }

    case 'add': {
      state.fields = addField(state.fields);
      persist();
      render();
      list.focus(state.fields.length ? state.fields[state.fields.length - 1].id : null, { select: true });
      return;
    }

    case 'duplicate': {
      const before = new Set(state.fields.map((field) => field.id));
      state.fields = duplicateField(state.fields, command.id, (name) => t('field.copyOf', name), t);
      const copy = state.fields.find((field) => !before.has(field.id));
      persist();
      render();
      list.focus(copy ? copy.id : command.id, { select: true });
      return;
    }

    case 'remove': {
      const neighbour = neighbourOf(state.fields, command.id);
      state.fields = removeField(state.fields, command.id);
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
  ui.monthlyNet.textContent = hasInput ? formatAmount(projection.monthlyNet) : '—';

  ui.summary.classList.toggle('is-empty', !hasInput);

  const shortfall = projection.monthlyNet < 0;
  ui.heroChip.hidden = !hasInput || projection.monthlyNet === 0;
  ui.heroChip.classList.toggle('is-critical', shortfall);
  ui.heroChip.classList.toggle('is-good', !shortfall);
  ui.heroChipText.textContent = shortfall
    ? t('summary.shortfall', formatAmount(Math.abs(projection.monthlyNet)))
    : t('summary.surplus', formatAmount(projection.monthlyNet));
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
  const projection = project({ fields: state.fields, months: state.months });
  const hasInput = hasAmounts(projection);
  const series = CHARTS.map((spec) => seriesOf(projection, spec.key));
  const domain = extentOf(series);
  // One geometry for all three cards: the widest end-label decides the gutter,
  // so the small multiples are drawn to the same pixel scale and can be
  // compared by eye, not just by their axes.
  const labelPad = Math.max(...series.map(
    (points) => endLabelPad(formatAmount(points[points.length - 1].value)),
  ));

  list.update(projection.fields, fieldLabels(), t);

  charts.forEach((chart, index) => {
    chart.instance.update({
      points: series[index],
      domain,
      months: projection.months,
      labelPad,
      isEmpty: !hasInput,
      emptyMessage: t('charts.empty'),
    });
  });

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
  buildCharts();
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
