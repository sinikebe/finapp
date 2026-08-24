/**
 * app.js — wiring. Reads the two inputs and the horizon, runs the projection,
 * pushes it into three charts that share one scale, and keeps the whole thing
 * usable offline.
 */

import { project, seriesOf, extentOf, toAmount, toMonths } from './projection.js';
import {
  formatAmount, formatWhole, formatCompact, formatMonth, formatHorizon, setFormatLocale,
} from './format.js';
import { createLineChart } from './chart.js';
import { LANGUAGES, detectLanguage, localeFor, makeTranslator } from './i18n.js';

const INPUT_KEY = 'finapp.inputs.v1';
const THEME_KEY = 'finapp.theme.v1';
const LANG_KEY = 'finapp.language.v1';
const THEME_ORDER = ['auto', 'light', 'dark'];
const THEME_COLORS = { light: '#f9f9f7', dark: '#0d0d0d' };

const $ = (id) => document.getElementById(id);

const ui = {
  income: $('income'),
  rent: $('rent'),
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
  themeButton: $('theme'),
  themeLabel: $('theme-label'),
  langButton: $('lang'),
  langLabel: $('lang-label'),
  description: $('doc-description'),
  installButton: $('install'),
  updateToast: $('update-toast'),
  updateReload: $('update-reload'),
  themeColor: $('theme-color'),
};

const ICONS = {
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

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode, or a full quota — the app still works, it just forgets. */
  }
}

/* -------------------------------------------------------------------- state */

const saved = readStore(INPUT_KEY, {}) || {};
const state = {
  income: Number.isFinite(Number(saved.income)) && Number(saved.income) > 0 ? String(toAmount(saved.income)) : '',
  rent: Number.isFinite(Number(saved.rent)) && Number(saved.rent) > 0 ? String(toAmount(saved.rent)) : '',
  months: toMonths(saved.months ?? 24),
};

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

/* ------------------------------------------------------------------- render */

let noteTimer = 0;

function renderSummary(projection, hasInput) {
  const horizon = formatHorizon(projection.months, t);
  ui.heroLabel.textContent = t('summary.heroLabel', projection.months);
  ui.heroValue.textContent = hasInput ? formatWhole(projection.totals.net) : '—';
  ui.totalIncome.textContent = hasInput ? formatWhole(projection.totals.income) : '—';
  ui.totalExpenses.textContent = hasInput ? formatWhole(projection.totals.expenses) : '—';
  ui.monthlyNet.textContent = hasInput ? formatAmount(projection.monthlyNet) : '—';

  const shortfall = projection.monthlyNet < 0;
  ui.heroChip.hidden = !hasInput || projection.monthlyNet === 0;
  ui.heroChip.classList.toggle('is-critical', shortfall);
  ui.heroChip.classList.toggle('is-good', !shortfall);
  ui.heroChipText.textContent = shortfall
    ? t('summary.shortfall', formatAmount(Math.abs(projection.monthlyNet)))
    : t('summary.surplus', formatAmount(projection.monthlyNet));
  ui.chipIconPath.setAttribute('d', shortfall ? ICONS.shortfall : ICONS.surplus);

  // One polite announcement once typing settles, rather than one per keystroke.
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => {
    ui.chartsNote.textContent = hasInput
      ? t(
        'charts.noteFilled',
        horizon,
        formatWhole(projection.totals.income),
        formatWhole(projection.totals.expenses),
        formatWhole(projection.totals.net),
      )
      : t('charts.notePrompt');
  }, 500);
}

function render() {
  const projection = project({
    monthlyIncome: state.income,
    monthlyRent: state.rent,
    months: state.months,
  });
  const hasInput = projection.monthlyIncome > 0 || projection.monthlyRent > 0;
  const series = CHARTS.map((spec) => seriesOf(projection, spec.key));
  const domain = extentOf(series);

  charts.forEach((chart, index) => {
    chart.instance.update({
      points: series[index],
      domain,
      months: projection.months,
      isEmpty: !hasInput,
      emptyMessage: t('charts.empty'),
    });
  });

  ui.monthsReadout.textContent = t('filter.readout', projection.months, formatHorizon(projection.months, t));
  for (const button of ui.presets) {
    const active = Number(button.dataset.months) === projection.months;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  renderSummary(projection, hasInput);
}

// Touch keeps the last tapped reading on screen; a tap anywhere else clears it.
document.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'touch') return;
  if (event.target instanceof Element && event.target.closest('.chart-svg')) return;
  for (const chart of charts) chart.instance.setActive(null);
});

/* ------------------------------------------------------------------- inputs */

let saveTimer = 0;
function persist() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    writeStore(INPUT_KEY, { income: state.income, rent: state.rent, months: state.months });
  }, 250);
}

function bindAmount(input, key) {
  input.value = state[key];
  input.addEventListener('input', () => {
    // A negative amount is meaningless here; snap it back rather than modelling it.
    if (input.value !== '' && Number(input.value) < 0) input.value = '';
    state[key] = input.value;
    persist();
    render();
  });
  input.addEventListener('blur', () => {
    const amount = toAmount(input.value);
    input.value = amount ? String(amount) : '';
    state[key] = input.value;
    persist();
    render();
  });
}

bindAmount(ui.income, 'income');
bindAmount(ui.rent, 'rent');

// The slider's own max is the source of truth for the horizon: a stored value
// beyond it (a hand-edited localStorage entry) is pulled back into range here
// rather than leaving the readout and the slider disagreeing.
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

/* ----------------------------------------------------------------- language */

const savedLanguage = readStore(LANG_KEY, null);
let language = LANGUAGES.includes(savedLanguage) ? savedLanguage : detectLanguage();
let t = makeTranslator(language);

function applyLanguage(next) {
  language = LANGUAGES.includes(next) ? next : 'en';
  t = makeTranslator(language);
  setFormatLocale(localeFor(language));

  document.documentElement.lang = t('html.lang');
  document.title = t('doc.title');
  if (ui.description) ui.description.setAttribute('content', t('doc.description'));

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
