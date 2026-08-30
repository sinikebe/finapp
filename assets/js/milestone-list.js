/**
 * milestone-list.js — the editable list of targets.
 *
 * The same shape as the field list, and for the same reason: rows are
 * reconciled in place rather than re-rendered, so a figure being typed is never
 * replaced under the caret by the app redrawing around it. Every change leaves
 * here as a command and the module owns no state beyond its DOM.
 *
 * A row is a question and its answer: what to watch and the figure to watch
 * for, with the month underneath. The answer is worded by the caller — the
 * month is a read over a projection this module has never seen, and putting the
 * dictionary in here would give the app two places that say when a plan gets
 * somewhere.
 */

import { actionIcon } from './field-list.js';
import { html, syncValue } from './dom.js';
import { MAX_MILESTONES } from './milestones.js';

/**
 * @param {{
 *   mount: HTMLElement,
 *   metrics: Array<string>,
 *   labels: object,
 *   onCommand: (command: {type: string, id?: string, patch?: object}) => void
 * }} options
 */
export function createMilestoneList(options) {
  const { mount, metrics, onCommand } = options;
  let labels = options.labels;

  const root = html('div', 'milestone-list', mount);
  const list = html('div', 'milestone-rows', root);
  list.setAttribute('role', 'list');

  const addButton = html('button', 'add-field', root);
  addButton.type = 'button';
  addButton.addEventListener('click', () => onCommand({ type: 'add' }));

  const rows = new Map();

  function createRow(milestone) {
    const element = html('div', 'milestone-row');
    element.setAttribute('role', 'listitem');
    element.dataset.id = milestone.id;

    const main = html('div', 'milestone-main', element);

    const metricLabel = html('label', 'sr-only', main);
    const metric = html('select', 'milestone-metric', main);
    metric.id = `milestone-${milestone.id}-metric`;
    metricLabel.htmlFor = metric.id;
    const metricOptions = metrics.map((key) => {
      const option = html('option', null, metric);
      option.value = key;
      return option;
    });

    const amountLabel = html('label', 'sr-only', main);
    const amount = html('input', 'milestone-amount', main);
    // Text rather than number, for the reason every amount in the app is text:
    // a number box parses by the browser's locale and drops the comma out of a
    // French reader's "12,50" before anything here can see it.
    amount.type = 'text';
    amount.id = `milestone-${milestone.id}-amount`;
    amount.inputMode = 'decimal';
    amount.autocomplete = 'off';
    amount.placeholder = '0';
    amountLabel.htmlFor = amount.id;

    const actions = html('div', 'milestone-actions', main);
    const remove = html('button', 'icon-button', actions);
    remove.type = 'button';
    actionIcon('remove', remove);

    // The answer, under the question. Not a live region: it moves on every
    // keystroke in the box above it, and a live region that did would read the
    // reader their own half-typed figure back at them.
    const said = html('p', 'milestone-said', element);

    const row = { element, metric, metricLabel, metricOptions, amount, amountLabel, said, remove };

    const id = milestone.id;
    metric.addEventListener('change', () => onCommand({ type: 'update', id, patch: { metric: metric.value } }));
    amount.addEventListener('input', () => onCommand({ type: 'update', id, patch: { amount: amount.value } }));
    // Leaving the box shows the figure the read will actually use, in the
    // reader's own separators — the same settle every amount in the app makes.
    amount.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { amount: amount.value } }));
    remove.addEventListener('click', () => onCommand({ type: 'remove', id }));

    return row;
  }

  function syncRow(row, milestone) {
    const named = labels.metricName(milestone.metric);

    row.metricLabel.textContent = labels.what;
    row.metricOptions.forEach((option, index) => {
      option.textContent = labels.metricName(metrics[index]);
    });
    syncValue(row.metric, milestone.metric);

    // Every row would otherwise announce the same box name, leaving a
    // screen-reader user with no idea which target they are editing. The select
    // needs no such help: its value is what tells the rows apart.
    row.amountLabel.textContent = labels.figure;
    row.amount.setAttribute('aria-label', labels.figureNamed(named));
    syncValue(row.amount, milestone.amount);

    row.element.setAttribute('aria-label', named);
    row.remove.setAttribute('aria-label', labels.removeNamed(named));

    row.said.textContent = labels.said(milestone);
  }

  return {
    element: root,

    /** Draw `milestones`, keeping every row the reader is working in untouched. */
    update(milestones, nextLabels) {
      if (nextLabels) labels = nextLabels;

      addButton.textContent = labels.add;
      const atCap = milestones.length >= MAX_MILESTONES;
      addButton.disabled = atCap;

      let cursor = list.firstChild;
      const present = new Set();
      for (const milestone of milestones) {
        present.add(milestone.id);
        let row = rows.get(milestone.id);
        if (!row) {
          row = createRow(milestone);
          rows.set(milestone.id, row);
        }
        // Moved only when the position actually changed: moving a node that
        // holds focus would drop the caret out of it.
        if (row.element !== cursor) list.insertBefore(row.element, cursor);
        else cursor = cursor.nextSibling;
        syncRow(row, milestone);
      }

      for (const [id, row] of rows) {
        if (present.has(id)) continue;
        row.element.remove();
        rows.delete(id);
      }
    },

    /**
     * Put focus where the reader expects it after a command.
     * @param {string|null} id the target to focus, or null for the add button
     */
    focus(id) {
      const row = id ? rows.get(id) : null;
      if (row) row.amount.focus();
      else addButton.focus();
    },
  };
}
