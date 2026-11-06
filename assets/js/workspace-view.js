/** Three arrangements of the same live workspace, with one editor and one model. */
import { html } from './dom.js';
import { bindNumericInput } from './input-validation.js';
import { formatAmount, formatHorizon, formatTyped } from './format.js';
import { nameOf } from './strategies.js';
import { LAYOUT_KEY, layoutOf, stepOf, createWorkspaceNavigation, comparisonReading, annualKmOf, carVariantsOf } from './workspace.js';

export function createWorkspaceView(options) {
  const $ = (id) => document.getElementById(id);
  const t = (...args) => options.translator()(...args);
  const main = $('main');
  const selector = $('layout-select');
  let layout = layoutOf(options.read(LAYOUT_KEY, 'horizon'));
  const navigation = createWorkspaceNavigation(options);
  let projectId = options.state.openProjectId;
  let { section, step } = navigation.forProject(projectId);
  const rememberView = () => navigation.remember(projectId, { section, step });

  function syncProject() {
    if (projectId === options.state.openProjectId) return;
    projectId = options.state.openProjectId;
    ({ section, step } = navigation.forProject(projectId));
    rememberView();
    kmBinding.clear();
  }

  const usage = html('div', 'usage-control', $('horizon'));
  const kmLabel = html('label', 'control-label', usage);
  const km = html('input', null, usage);
  km.id = 'annual-km'; km.type = 'text'; km.inputMode = 'numeric'; km.autocomplete = 'off';
  kmLabel.htmlFor = km.id;
  const kmError = html('p', null, usage);
  const calculation = html('details', 'usage-calculation', usage);
  const calculationLabel = html('summary', null, calculation);
  const kmNote = html('p', 'hint', calculation);
  let beganKm = false;
  km.addEventListener('focus', () => { beganKm = false; });
  const kmBinding = bindNumericInput(km, {
    options: () => ({ min: 0, max: 200000, integer: true, allowEmpty: false }),
    errorNode: kmError, message: () => t('workspace.kmBounds'), onValidity: options.onValidity,
    onInput: (text) => { options.onKm(text, !beganKm); beganKm = true; },
    onSettle: (text) => { options.onKm(text, !beganKm); beganKm = false; },
  });
  const kmPresets = html('div', 'usage-presets', usage);
  for (const amount of [10000, 15000, 25000]) {
    const button = html('button', 'preset', kmPresets); button.type = 'button';
    button.dataset.km = String(amount);
    button.addEventListener('click', () => { kmBinding.clear(); options.onKm(String(amount), true); });
  }

  function focusHeading() {
    const target = layout === 'parcours' && step < 2 ? $('journey-question') : section === 'data' ? $('inputs') : section === 'assumptions' ? $('assumptions-heading') : section === 'compare' ? $('compare-heading') : $('summary');
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function setStep(next, focus = true) {
    syncProject();
    step = stepOf(next);
    rememberView();
    apply();
    if (focus) focusHeading();
  }

  function navigate(next, { focus = true } = {}) {
    syncProject();
    section = ['overview', 'data', 'compare', 'assumptions'].includes(next) ? next : 'overview';
    if (layout === 'parcours') {
      step = section === 'data' || section === 'assumptions' ? 1 : 2;
    }
    rememberView();
    apply();
    if (focus) focusHeading();
  }

  function apply() {
    document.body.dataset.layout = layout;
    document.body.dataset.section = section;
    document.body.dataset.step = String(step);
    selector.value = layout;
    for (const button of document.querySelectorAll('[data-workspace-section]')) {
      const active = button.dataset.workspaceSection === section;
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    for (const button of document.querySelectorAll('[data-journey-step]')) {
      if (Number(button.dataset.journeyStep) === step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    }
    $('journey-back').disabled = step === 0;
    $('journey-next').textContent = t(step === 2 ? 'workspace.startOver' : step === 1 ? 'workspace.seeResults' : 'workspace.continue');
    $('journey-progress').textContent = t('workspace.stepProgress', step + 1, 3);
    $('journey-question').textContent = t(step === 0 ? 'workspace.usageQuestion' : 'workspace.figuresQuestion');
    $('journey-explanation').textContent = t(step === 0 ? 'workspace.usageHelp' : 'workspace.figuresHelp');
    $('workspace-description').textContent = t(`workspace.description.${layout}`);
    $('workspace-sidebar-name').textContent = layout[0].toUpperCase() + layout.slice(1);
    if (section === 'data' || section === 'assumptions' || (layout === 'parcours' && step === 1)) options.onData();
    if (section === 'assumptions') document.querySelector('.assumptions-fold').open = true;
  }

  selector.addEventListener('change', () => {
    layout = layoutOf(selector.value);
    options.write(LAYOUT_KEY, layout);
    apply();
    $('workspace-announcement').textContent = t('workspace.layoutChanged', selector.selectedOptions[0].textContent);
  });
  for (const link of document.querySelectorAll('[data-workspace-section]')) link.addEventListener('click', (event) => {
    event.preventDefault(); navigate(link.dataset.workspaceSection);
  });
  $('sidebar-projects').addEventListener('click', options.onProjects);
  $('sidebar-new').addEventListener('click', () => $('new-project').click());
  $('workspace-edit').addEventListener('click', () => navigate('data'));
  $('workspace-assumptions').addEventListener('click', () => navigate('assumptions'));
  $('assumptions-edit').addEventListener('click', () => navigate('assumptions', { focus: false }));
  for (const button of document.querySelectorAll('[data-journey-step]')) button.addEventListener('click', () => setStep(Number(button.dataset.journeyStep)));
  $('journey-back').addEventListener('click', () => setStep(step - 1));
  $('journey-next').addEventListener('click', () => {
    const invalid = [...main.querySelectorAll('input[aria-invalid="true"]')].find((input) => input.getClientRects().length);
    if (invalid) { invalid.focus(); invalid.reportValidity(); return; }
    setStep(step === 2 ? 0 : step + 1);
  });

  function update(projection, projections) {
    const state = options.state;
    document.body.dataset.comparing = String(state.strategies.length > 1);
    syncProject();
    kmLabel.textContent = t('workspace.annualKm');
    calculationLabel.textContent = t('workspace.energyCalculation');
    kmNote.textContent = t('workspace.kmNote');
    const variants = carVariantsOf(state.strategies);
    usage.hidden = variants.length !== state.strategies.length || !variants.length;
    const annualKm = annualKmOf(state.strategies);
    km.placeholder = t('workspace.customUsage');
    kmBinding.sync(annualKm === null ? '' : formatTyped(annualKm));
    for (const button of kmPresets.children) {
      button.textContent = `${Number(button.dataset.km).toLocaleString(document.documentElement.lang)} km`;
      button.setAttribute('aria-pressed', String(Number(button.dataset.km) === annualKm));
    }
    const reading = comparisonReading(state.strategies, projections, options.metric());
    const active = Math.max(0, state.strategies.findIndex((strategy) => strategy.id === state.activeId));
    const value = reading.values[active];
    $('workspace-active-name').textContent = nameOf(state.strategies[active], active, t);
    $('workspace-period').textContent = formatHorizon(state.months, t);
    $('workspace-comparison-note').textContent = t(reading.car ? 'workspace.costExplanation' : 'workspace.comparisonExplanation');
    // Preserve the explicit underlying cash / debt information in Detailed totals.
    if (reading.car) {
      $('hero-label').textContent = `${t('workspace.netCost')} · ${formatHorizon(state.months, t)}`;
      $('hero-value').textContent = formatAmount(value);
      $('simple-worth').textContent = formatAmount(projection.totals.owned);
      $('simple-worth').previousElementSibling.textContent = t('workspace.residual');
      $('simple-monthly').textContent = formatAmount(value / state.months);
      $('simple-monthly').previousElementSibling.textContent = t('workspace.monthlyCost');
    } else {
      $('simple-worth').previousElementSibling.textContent = t('ui.worth');
      $('simple-monthly').previousElementSibling.textContent = t('ui.monthly');
    }
    $('journey-recap-name').textContent = nameOf(state.strategies[active], active, t);
    $('journey-recap-duration').textContent = formatHorizon(state.months, t);
    $('journey-recap-value').textContent = formatAmount(value);
    $('journey-recap-label').textContent = t(reading.car ? 'workspace.netCost' : options.metric() === 'worth' ? 'ui.worth' : 'ui.cash');
    const connection = t(navigator.onLine ? 'workspace.localData' : 'workspace.offline');
    if ($('connection-status').textContent !== connection) $('connection-status').textContent = connection;
    apply();
  }
  window.addEventListener('online', () => { $('connection-status').textContent = t('workspace.localData'); });
  window.addEventListener('offline', () => { $('connection-status').textContent = t('workspace.offline'); });
  apply();
  return { update, navigate, clearDrafts() { kmBinding.clear(); }, layout: () => layout };
}
