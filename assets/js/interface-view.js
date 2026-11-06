/** The Simple / Advanced presentation, creation choices and backup preview. */
import { html, syncValue } from './dom.js';
import { nameOf } from './strategies.js';
import { nameOf as projectNameOf, MAX_PROJECTS } from './projects.js';
import { loadWorkspace, snapshotOf } from './state.js';
import { labelOf } from './fields.js';
import { advancedFields } from './interface.js';
import { readNumericInput } from './input-validation.js';
import { parseBackup, backupSummary, MAX_BACKUP_BYTES } from './backup.js';
import { formatAmount, formatRate } from './format.js';
import { runsDryAt, hasAmounts } from './projection.js';

export function createInterfaceView(options) {
  const { state, store, saver, onValidity } = options;
  const $ = (id) => document.getElementById(id);
  const t = (...args) => options.translator()(...args);
  const welcome = $('welcome');
  const restore = $('backup-restore');
  const years = $('horizon-years');
  const months = $('horizon-months');
  let horizonInvalid = false;
  let offered = null;
  let source = null;
  let fileName = '';
  const cards = new Map();
  const rules = new Map();

  function closeTools() { document.querySelector('.tools-menu').open = false; }
  $('mode-simple').addEventListener('click', () => options.onMode('simple'));
  $('mode-advanced').addEventListener('click', () => options.onMode('advanced'));
  $('new-project').addEventListener('click', () => { welcome.showModal(); });
  $('welcome-close').addEventListener('click', () => welcome.close());
  for (const button of welcome.querySelectorAll('[data-start]')) button.addEventListener('click', () => {
    if (options.onStart(button.dataset.start) !== false) welcome.close();
  });
  $('nav-data').addEventListener('click', options.onData);
  $('assumptions-edit').addEventListener('click', () => {
    const fold = document.querySelector('.assumptions-fold');
    fold.open = true; fold.scrollIntoView({ block: 'start' }); fold.querySelector('summary').focus();
  });
  $('chart-cash').addEventListener('click', () => options.onMetric('net'));
  $('chart-worth').addEventListener('click', () => options.onMetric('worth'));
  $('currency').value = options.readCurrency();
  $('currency').addEventListener('change', () => options.onCurrency($('currency').value));

  function horizonEdit(settle = false) {
    const y = readNumericInput(years.value, { max: 50, integer: true });
    const m = readNumericInput(months.value, { max: 11, integer: true });
    const total = y.number * 12 + m.number;
    horizonInvalid = !y.valid || !m.valid || total < 1 || total > 600;
    const error = $('horizon-error');
    error.hidden = !horizonInvalid;
    error.textContent = t('ui.inputBounds');
    for (const input of [years, months]) {
      input.setAttribute('aria-invalid', String(horizonInvalid));
      input.setAttribute('aria-describedby', error.id);
    }
    onValidity('horizon', horizonInvalid);
    if (!horizonInvalid) {
      options.onHorizon(total);
      if (settle) { years.value = String(Math.floor(total / 12)); months.value = String(total % 12); }
    }
  }
  for (const input of [years, months]) {
    input.addEventListener('input', () => horizonEdit());
    input.addEventListener('blur', () => horizonEdit(true));
  }

  $('backup-open').addEventListener('click', () => { closeTools(); restore.showModal(); });
  $('backup-close').addEventListener('click', () => restore.close());
  $('backup-file').addEventListener('change', async () => {
    const file = $('backup-file').files[0];
    offered = source = null; $('backup-preview').hidden = true; $('backup-message').textContent = '';
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw { code: 'tooLarge' };
      const text = await file.text();
      // A slow previous file read must not replace the current selection.
      if ($('backup-file').files[0] !== file) return;
      offered = parseBackup(text); fileName = file.name;
      $('backup-source').textContent = '';
      const main = html('option', null, $('backup-source')); main.value = '0'; main.textContent = t('ui.restoreSaved');
      offered.drafts.forEach((draft, index) => {
        const option = html('option', null, $('backup-source')); option.value = String(index + 1);
        option.textContent = `${index + 1} · ${draft.updatedAt ? new Date(draft.updatedAt).toLocaleString(document.documentElement.lang) : t('save.recover')}`;
      });
      previewBackup();
    } catch (error) {
      if ($('backup-file').files[0] !== file) return;
      $('backup-message').textContent = t(error.code === 'tooLarge' ? 'ui.restoreLarge' : error.code === 'references' ? 'ui.restoreReferences' : 'ui.restoreInvalid');
    }
  });
  function previewBackup() {
    if (!offered) return;
    const selected = Number($('backup-source').value);
    source = selected ? offered.drafts[selected - 1]?.snapshot : offered.workspace;
    if (!source) return;
    const summary = backupSummary(source);
    const workspace = loadWorkspace(source);
    $('backup-summary').textContent = [fileName, offered.exportedAt ? new Date(offered.exportedAt).toLocaleString(document.documentElement.lang) : '', t('ui.backupCount', summary.projects, summary.strategies)].filter(Boolean).join(' · ');
    $('backup-projects').textContent = '';
    workspace.projects.forEach((project, index) => { html('li', null, $('backup-projects')).textContent = projectNameOf(project, index, workspace.projects.length, t); });
    $('backup-preview').hidden = false;
  }
  $('backup-source').addEventListener('change', previewBackup);
  $('backup-confirm').addEventListener('click', async () => {
    if (!source) return;
    const status = saver.status();
    if (status.saving || status.pendingRemote || !['saved', 'pending'].includes(status.state)) { $('backup-message').textContent = t('ui.restoreBusy'); return; }
    const saved = await saver.save();
    if (saved.status !== 'saved') { $('backup-message').textContent = t('ui.restoreBusy'); return; }
    if (!store.keepRecovery(snapshotOf(state))) { $('backup-message').textContent = t('ui.restoreSafety'); return; }
    $('backup-confirm').disabled = true;
    try {
      const result = await saver.replace(source);
      if (result.status === 'saved') { source = offered = null; $('backup-preview').hidden = true; $('backup-message').textContent = t('ui.restoreSuccess'); }
      else $('backup-message').textContent = t('ui.restoreBusy');
    } finally { $('backup-confirm').disabled = false; }
  });

  function update(projection, projections) {
    const advanced = options.mode() === 'advanced';
    $('mode-simple').setAttribute('aria-pressed', String(!advanced));
    $('mode-advanced').setAttribute('aria-pressed', String(advanced));
    $('nav-compare').hidden = state.strategies.length < 2;
    $('chart-cash').setAttribute('aria-pressed', String(options.metric() === 'net'));
    $('chart-worth').setAttribute('aria-pressed', String(options.metric() === 'worth'));
    if (!horizonInvalid) { syncValue(years, Math.floor(state.months / 12)); syncValue(months, state.months % 12); }
    const hasInput = hasAmounts(projection);
    $('simple-worth').textContent = hasInput ? formatAmount(projection.totals.worth) : '—';
    $('simple-monthly').textContent = hasInput ? formatAmount(projection.averages.net) : '—';
    const assumptions = [t('ui.assumptions'), `${t('ui.taxRate')} : ${formatRate(state.tax)} %`, state.realMoney ? `${t('ui.inflationRate')} : ${formatRate(state.inflation)} %` : t('ui.nominal')];
    if (state.showRange) assumptions.push(`${t('ui.returnRange')} : ±${formatRate(state.spread)} %`);
    $('active-assumptions').textContent = assumptions.join(' · ');

    const present = new Set();
    state.strategies.forEach((strategy, index) => {
      present.add(strategy.id);
      let card = cards.get(strategy.id);
      if (!card) {
        const element = html('article', 'comparison-card', $('simple-comparison'));
        const title = html('h3', null, element);
        const source = html('p', 'hint', element);
        const figures = html('dl', null, element);
        const cashLabel = html('dt', null, figures); const cash = html('dd', null, figures);
        const worthLabel = html('dt', null, figures); const worth = html('dd', null, figures);
        const warning = html('p', 'hint', element);
        const select = html('button', 'ghost-button', element); select.type = 'button';
        select.addEventListener('click', () => options.onScenario(strategy.id));
        card = { element, title, source, cashLabel, cash, worthLabel, worth, warning, select }; cards.set(strategy.id, card);
      }
      const run = projections[index];
      const dry = runsDryAt(run);
      card.element.dataset.active = String(strategy.id === state.activeId);
      card.title.textContent = nameOf(strategy, index, t);
      card.source.textContent = t(strategy.origin === 'default' ? 'ui.example' : strategy.origin === 'shared' ? 'ui.shared' : 'ui.own');
      card.cashLabel.textContent = t('ui.cash'); card.cash.textContent = hasAmounts(run) ? formatAmount(run.totals.net) : '—';
      card.worthLabel.textContent = t('ui.worth'); card.worth.textContent = hasAmounts(run) ? formatAmount(run.totals.worth) : '—';
      card.warning.textContent = dry ? t('summary.runsDry', dry.month, formatAmount(Math.abs(dry.worst))) : hasAmounts(run) ? t('ui.noShortfall') : t('charts.notePrompt');
      card.warning.classList.toggle('is-warning', Boolean(dry));
      card.select.textContent = t('ui.selectScenario');
      card.select.setAttribute('aria-label', `${t('ui.selectScenario')} · ${nameOf(strategy, index, t)}`);
      card.select.setAttribute('aria-pressed', String(strategy.id === state.activeId));
    });
    for (const [id, card] of cards) if (!present.has(id)) { card.element.remove(); cards.delete(id); }

    const active = advancedFields(state.strategies.flatMap((strategy) => strategy.fields));
    const keys = new Set();
    for (const field of active) {
      if (keys.has(field.id)) continue;
      keys.add(field.id);
      let row = rules.get(field.id);
      if (!row) { row = html('button', 'advanced-rule ghost-button', $('advanced-settings-list')); row.type = 'button'; row.addEventListener('click', () => options.onAdvanced(field.id)); rules.set(field.id, row); }
      const ownerIndex = state.strategies.findIndex((strategy) => strategy.fields.some((one) => one.id === field.id));
      row.textContent = `${nameOf(state.strategies[ownerIndex], ownerIndex, t)} · ${labelOf(field, t)} · ${options.describeField(field)}`;
    }
    for (const [id, row] of rules) if (!keys.has(id)) { row.remove(); rules.delete(id); }
    $('advanced-settings').hidden = !keys.size;
    $('advanced-settings-count').textContent = t('ui.ruleCount', keys.size);
    const full = state.projects.length >= MAX_PROJECTS && !options.fresh();
    for (const button of welcome.querySelectorAll('[data-start]')) if (button.dataset.start !== 'examples') button.disabled = full;
    if (advanced) document.querySelector('.summary-details').open = true;
    if (offered) previewBackup();
  }
  return {
    update,
    showWelcome() { welcome.showModal(); },
    hideWelcome() { if (welcome.open) welcome.close(); },
    clearDrafts() { horizonInvalid = false; onValidity('horizon', false); $('horizon-error').hidden = true; for (const input of [years, months]) input.removeAttribute('aria-invalid'); },
  };
}
