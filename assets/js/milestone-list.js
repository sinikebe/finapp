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
 *
 * A target the plan never reaches grows one thing more: the same question asked
 * backwards. It sits on that row rather than anywhere else in the app because
 * that row is where a reader is already looking at a destination they have not
 * got to, and because it needs no second vocabulary — the metric and the figure
 * are the ones already in the boxes above it. What can be asked about, and what
 * the answer is, both arrive worded from the caller for the same reason the
 * month does.
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

    // ...and, where the plan never gets there, the same question turned round.
    // Built once with the row and hidden rather than made and unmade as the
    // reader types: a control that comes and goes takes whatever focus was in
    // it with it, and a figure one keystroke away from being reached would have
    // this appearing and disappearing under the caret.
    const ask = html('div', 'milestone-ask', element);
    const asking = html('div', 'milestone-asking', ask);
    const chooseLabel = html('label', 'sr-only', asking);
    const choose = html('select', 'milestone-choice', asking);
    choose.id = `milestone-${milestone.id}-choice`;
    chooseLabel.htmlFor = choose.id;
    const askButton = html('button', 'ghost-button milestone-solve', asking);
    askButton.type = 'button';

    // The answer, inside the ask rather than beside it — so that a live region
    // is only ever in the page while the button that fills it is too, and an
    // empty one is never left behind holding a row open.
    //
    // And this one *is* live, where `said` above it deliberately is not: it
    // changes only because the reader pressed the button next to it, so
    // announcing it reads them the answer to something they just asked rather
    // than their own half-typed figure.
    const answer = html('p', 'milestone-answer', ask);
    answer.setAttribute('role', 'status');

    const row = {
      element, metric, metricLabel, metricOptions, amount, amountLabel, said, remove,
      ask, choose, chooseLabel, askButton, answer, offered: '',
    };

    const id = milestone.id;
    metric.addEventListener('change', () => onCommand({ type: 'update', id, patch: { metric: metric.value } }));
    amount.addEventListener('input', () => onCommand({ type: 'update', id, patch: { amount: amount.value } }));
    // Leaving the box shows the figure the read will actually use, in the
    // reader's own separators — the same settle every amount in the app makes.
    amount.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { amount: amount.value } }));
    remove.addEventListener('click', () => onCommand({ type: 'remove', id }));
    askButton.addEventListener('click', () => onCommand({ type: 'ask', id, key: choose.value }));

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
    syncAsk(row, milestone, named);
  }

  /**
   * The backwards question, which is only there for a target the plan misses.
   *
   * The options are rebuilt only when the plan's own list of figures actually
   * changed — every render otherwise — because replacing them puts the select
   * back to its first entry, and a reader who chose one and reached for the
   * button would find the app had chosen something else for them. Their names
   * are written every time regardless: those follow the language and whatever
   * the reader has since called the field.
   */
  function syncAsk(row, milestone, named) {
    row.ask.hidden = !labels.canAsk(milestone);
    row.chooseLabel.textContent = labels.choose;
    row.choose.setAttribute('aria-label', labels.chooseNamed(named));
    row.askButton.textContent = labels.ask;
    row.askButton.setAttribute('aria-label', labels.askNamed(named));

    const { candidates } = labels;
    const offered = candidates.map((candidate) => candidate.key).join('\n');
    if (row.offered !== offered) {
      row.offered = offered;
      const chosen = row.choose.value;
      row.choose.textContent = '';
      for (const candidate of candidates) {
        const option = html('option', null, row.choose);
        option.value = candidate.key;
      }
      // Kept where the figure it names is still in the plan; otherwise the
      // select falls to its first entry, which is what a fresh row does too.
      if (candidates.some((candidate) => candidate.key === chosen)) row.choose.value = chosen;
    }
    candidates.forEach((candidate, index) => {
      row.choose.options[index].textContent = candidate.name;
    });

    row.answer.textContent = labels.asked(milestone);
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
