/** Reconciled comparison cards: a ranking in Horizon, an editable board in Atelier. */
import { html } from './dom.js';
import { nameOf } from './strategies.js';
import { labelOf } from './fields.js';
import { bindNumericInput } from './input-validation.js';
import { formatAmount, formatTyped } from './format.js';
import { runsDryAt, hasAmounts, toAmount } from './projection.js';
import { comparisonReading } from './workspace.js';

export function createWorkspaceCards(mount, options) {
  const cards = new Map();
  let t = options.translator();
  function update(state, projections) {
    t = options.translator();
    const reading = comparisonReading(state.strategies, projections, options.metric());
    const present = new Set();
    const scale = Math.max(1, ...reading.values.map(Math.abs));
    state.strategies.forEach((strategy, index) => {
      present.add(strategy.id);
      let card = cards.get(strategy.id);
      if (!card) {
        const element = html('article', 'comparison-card', mount);
        const top = html('div', 'comparison-title', element);
        const dot = html('span', 'scenario-dot', top); dot.setAttribute('aria-hidden', 'true');
        const title = html('h3', null, top);
        const source = html('p', 'hint comparison-origin', element);
        const primary = html('p', 'comparison-primary', element);
        const caption = html('p', 'hint comparison-caption', element);
        const delta = html('p', 'comparison-delta', element);
        const track = html('div', 'comparison-track', element); track.setAttribute('aria-hidden', 'true');
        const bar = html('span', null, track);
        const figures = html('dl', 'comparison-figures', element);
        const cashLabel = html('dt', null, figures); const cash = html('dd', null, figures);
        const worthLabel = html('dt', null, figures); const worth = html('dd', null, figures);
        const warning = html('p', 'hint comparison-warning', element);
        const quick = html('div', 'quick-fields', element);
        const select = html('button', 'ghost-button comparison-select', element); select.type = 'button';
        select.addEventListener('click', () => options.onScenario(strategy.id));
        const edit = html('button', 'ghost-button comparison-edit', element); edit.type = 'button';
        edit.addEventListener('click', () => options.onEdit(strategy.id));
        card = { element, dot, title, source, primary, caption, delta, bar, cashLabel, cash, worthLabel, worth, warning, quick, select, edit, inputs: new Map() };
        cards.set(strategy.id, card);
      }
      if (mount.children[index] !== card.element) mount.insertBefore(card.element, mount.children[index] || null);
      const run = projections[index];
      const value = reading.values[index];
      const dry = runsDryAt(run);
      const filled = hasAmounts(run);
      card.element.dataset.active = String(strategy.id === state.activeId);
      card.element.dataset.best = String(value === reading.best && filled);
      card.element.style.setProperty('--scenario-color', `var(--strategy-${index + 1})`);
      card.title.textContent = nameOf(strategy, index, t);
      card.source.textContent = t(strategy.origin === 'default' ? 'ui.example' : strategy.origin === 'shared' ? 'ui.shared' : 'ui.own');
      card.primary.textContent = filled ? formatAmount(value) : '—';
      card.caption.textContent = t(reading.car ? 'workspace.netCost' : options.metric() === 'worth' ? 'ui.worth' : 'ui.cash');
      const gap = Math.abs(value - reading.best);
      card.delta.textContent = !filled ? '' : value === reading.best ? t(reading.car ? 'workspace.lowestCost' : 'workspace.highestBalance') : t('workspace.bestGap', formatAmount(gap));
      card.bar.style.width = `${Math.abs(value) / scale * 100}%`;
      card.cashLabel.textContent = t('ui.cash'); card.cash.textContent = filled ? formatAmount(run.totals.net) : '—';
      card.worthLabel.textContent = t('ui.worth'); card.worth.textContent = filled ? formatAmount(run.totals.worth) : '—';
      // An outlay-only ownership comparison is a cost budget, not a funded cash plan.
      card.warning.textContent = reading.car ? t('workspace.costCaveat') : dry ? t('summary.runsDry', dry.month, formatAmount(Math.abs(dry.worst))) : filled ? t('ui.noShortfall') : t('charts.notePrompt');
      card.warning.classList.toggle('is-warning', Boolean(dry) && !reading.car);
      card.select.textContent = t(strategy.id === state.activeId ? 'workspace.selected' : 'ui.selectScenario');
      card.select.setAttribute('aria-label', `${t('ui.selectScenario')} · ${nameOf(strategy, index, t)}`);
      card.select.setAttribute('aria-pressed', String(strategy.id === state.activeId));
      card.edit.textContent = t('workspace.editScenario');
      card.edit.setAttribute('aria-label', `${t('workspace.editScenario')} · ${nameOf(strategy, index, t)}`);

      // Actual model fields, including common identities; no alternate model per theme.
      const visibleFields = strategy.fields.filter((field) => field.kind !== 'asset').slice(0, 3);
      const fieldIds = new Set(visibleFields.map((field) => field.id));
      for (const field of visibleFields) {
        let row = card.inputs.get(field.id);
        if (!row) {
          const container = html('div', 'quick-field', card.quick);
          const label = html('label', null, container);
          const input = html('input', null, container);
          input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off';
          input.id = `quick-${strategy.id}-${field.id}`; label.htmlFor = input.id;
          const error = html('p', null, container);
          let began = false;
          input.addEventListener('focus', () => { began = false; });
          const binding = bindNumericInput(input, {
            errorNode: error, message: () => t('ui.inputBounds'), onValidity: options.onValidity,
            onInput(text) { options.onAmount(strategy.id, field.id, text, !began); began = true; },
            onSettle(text) {
              if (began) options.onAmount(strategy.id, field.id, text.trim() ? formatTyped(toAmount(text)) : '', false);
              began = false;
            },
          });
          row = { container, label, binding }; card.inputs.set(field.id, row);
        }
        row.label.textContent = `${labelOf(field, t)}${field.synced ? ` · ${t('ui.common')}` : ''}`;
        row.binding.sync(field.amount);
      }
      for (const [id, row] of card.inputs) if (!fieldIds.has(id)) { row.binding.clear(); row.container.remove(); card.inputs.delete(id); }
    });
    for (const [id, card] of cards) if (!present.has(id)) {
      for (const row of card.inputs.values()) row.binding.clear();
      card.element.remove(); cards.delete(id);
    }
  }
  return { update, clearDrafts() { for (const card of cards.values()) for (const row of card.inputs.values()) row.binding.clear(); } };
}
