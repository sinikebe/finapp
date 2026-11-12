/** Optional browser conveniences with ordinary download and copy fallbacks. */
import { html } from './dom.js';
import { nameOf } from './strategies.js';

/** Cancel means cancel; unsupported pickers and failed writes fall back to download. */
export async function saveFile(contents, filename, mime, host = window, { native = true } = {}) {
  if (native && typeof host.showSaveFilePicker === 'function') {
    try {
      const extension = '.' + filename.split('.').pop();
      const handle = await host.showSaveFilePicker({ suggestedName: filename, types: [{ description: filename, accept: { [mime]: [extension] } }] });
      const writable = await handle.createWritable();
      try { await writable.write(contents); await writable.close(); }
      catch (error) { try { await writable.abort(); } catch { /* closed or unavailable */ } throw error; }
      return 'saved';
    } catch (error) { if (error.name === 'AbortError') return 'cancelled'; }
  }
  const url = host.URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = host.document.createElement('a');
  link.href = url; link.download = filename;
  host.document.body.appendChild(link); link.click(); link.remove();
  host.setTimeout(() => host.URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

/** Protect text labels against spreadsheet formulas while retaining signed numeric cells. */
export function csvCell(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function resultsCsv(state, projections, t) {
  const metrics = ['income', 'expenses', 'net', 'owned', 'debt', 'invested', 'worth'];
  const labels = ['summary.totalIncome', 'summary.totalExpenses', 'ui.cash', 'summary.owned', 'summary.debt', 'summary.invested', 'ui.worth'];
  const rows = [[t('ui.scenarioName'), t('ui.months'), ...labels.map((key) => t(key))]];
  state.strategies.forEach((strategy, index) => rows.push([nameOf(strategy, index, t), state.months, ...metrics.map((key) => projections[index].totals[key])]));
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

export function createBrowserTools(options) {
  const $ = (id) => document.getElementById(id);
  const t = (...args) => options.translator()(...args);
  const tools = document.querySelector('.tools-menu');
  tools.addEventListener('toggle', () => {
    if (tools.open) document.querySelectorAll('[data-suite-switcher][open]').forEach((menu) => { menu.open = false; });
  });
  document.addEventListener('click', (event) => {
    if (tools.open && !tools.contains(event.target)) tools.open = false;
  });
  tools.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && tools.open && !document.querySelector('dialog[open]')) {
      event.preventDefault(); tools.open = false; tools.querySelector('summary').focus();
    }
  });
  const dialog = $('commands');
  const search = $('commands-search');
  const list = $('commands-list');
  const commands = [
    ['workspace.overview', () => options.onNavigate('overview')],
    ['workspace.myFigures', () => options.onNavigate('data')],
    ['ui.compare', () => options.onNavigate('compare')],
    ['workspace.assumptions', () => options.onNavigate('assumptions')],
    ['workspace.projects', options.onProjects],
    ['ui.newProject', () => $('new-project').click()],
    ['workspace.switchMode', options.onMode],
    ['undo.label', () => $('undo').click(), () => !$('undo').hidden],
    ['save.export', options.onBackup],
    ['workspace.saveAs', () => options.onBackup({ native: true }), () => typeof window.showSaveFilePicker === 'function'],
    ['ui.restore', () => $('backup-open').click()],
    ['drive.open', () => $('drive-open').click()],
    ['workspace.exportResults', exportResults],
    ['workspace.print', () => window.print()],
    ['action.share', () => $('share-open').click()],
    ['action.install', () => $('install').click(), () => !$('install').hidden],
  ];
  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  function renderCommands() {
    const query = normalize(search.value);
    list.replaceChildren();
    for (const [key, run, available] of commands) {
      if ((available && !available()) || !normalize(t(key)).includes(query)) continue;
      const button = html('button', 'command-option', list); button.type = 'button'; button.textContent = t(key);
      button.addEventListener('click', () => { dialog.close(); document.querySelector('.tools-menu').open = false; run(); });
    }
    $('commands-empty').hidden = list.children.length > 0;
  }
  function openCommands() {
    if (document.querySelector('dialog[open]')) return;
    search.value = ''; search.placeholder = t('workspace.searchActions'); renderCommands(); dialog.showModal(); search.focus();
  }
  $('commands-open').addEventListener('click', openCommands);
  $('commands-menu').addEventListener('click', () => { document.querySelector('.tools-menu').open = false; openCommands(); });
  $('commands-close').addEventListener('click', () => dialog.close());
  search.addEventListener('input', renderCommands);
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target === search && list.firstElementChild) {
      event.preventDefault(); list.firstElementChild.click(); return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const buttons = [...list.children]; if (!buttons.length) return;
    event.preventDefault();
    const at = buttons.indexOf(document.activeElement);
    buttons[(at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault(); if (dialog.open) dialog.close(); else openCommands();
    }
    const editing = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]');
    if (!editing && !document.querySelector('dialog[open]') && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !$('undo').hidden) {
      event.preventDefault(); $('undo').click();
    }
  });
  function exportResults() {
    void saveFile(resultsCsv(options.state, options.projections(), t), `finapp-results-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv', window, { native: false });
  }
  $('results-download').addEventListener('click', exportResults);
  $('backup-save-as').hidden = typeof window.showSaveFilePicker !== 'function';
  $('backup-save-as').addEventListener('click', () => options.onBackup({ native: true }));
  $('print-results').addEventListener('click', () => window.print());
  const native = $('share-native');
  native.hidden = typeof navigator.share !== 'function';
  native.addEventListener('click', async () => {
    try { await navigator.share({ title: document.title, url: $('share-link').value }); }
    catch (error) { if (error.name !== 'AbortError') $('share-said').textContent = t('workspace.shareFallback'); }
  });

  const drop = $('backup-drop'); let depth = 0;
  const isFile = (event) => [...(event.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (event) => { if (isFile(event)) { event.preventDefault(); depth++; drop.hidden = false; } });
  window.addEventListener('dragover', (event) => { if (isFile(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
  window.addEventListener('dragleave', (event) => { if (isFile(event) && --depth <= 0) { depth = 0; drop.hidden = true; } });
  window.addEventListener('drop', (event) => {
    if (!isFile(event)) return;
    event.preventDefault(); depth = 0; drop.hidden = true;
    if (event.dataTransfer.files[0]) options.onRestore(event.dataTransfer.files[0]);
  });
  window.addEventListener('dragend', () => { depth = 0; drop.hidden = true; });
  return { openCommands };
}
