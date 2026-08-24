/**
 * field-list.js — the editable list of money fields.
 *
 * Rows are reconciled in place rather than re-rendered, so typing in one field
 * is never interrupted by the app re-drawing around it. Every change leaves
 * here as a command; the module owns no state of its own beyond the DOM.
 *
 * A field with a new attribute needs one control added to `createRow`, one line
 * in `syncRow`, and a command — the reconciliation, focus handling and
 * translation pass already cover it.
 */

import { labelOf, MAX_FIELDS, PERIODS, KINDS } from './fields.js';
import { html, svgEl } from './dom.js';

const ACTION_ICONS = {
  duplicate: ['M9 9h9.5a1.5 1.5 0 0 1 1.5 1.5V20a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 20v-9.5A1.5 1.5 0 0 1 9 9Z', 'M16.5 6H6a1.5 1.5 0 0 0-1.5 1.5V18'],
  remove: ['M5.5 7.5h13', 'M10 7.5V6a1.5 1.5 0 0 1 1.5-1.5h1A1.5 1.5 0 0 1 14 6v1.5', 'M7 7.5V19a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 19V7.5'],
};

/** One of the row action icons, also used by the strategy bar. */
export function actionIcon(name, parent) {
  const node = svgEl('svg', {
    class: 'action-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
  }, parent);
  for (const d of ACTION_ICONS[name]) svgEl('path', { d }, node);
  return node;
}

/** Show or hide a control and the label that names it. */
function setVisible(control, label, visible) {
  control.hidden = !visible;
  label.hidden = !visible;
}

/** Write a value into a control the reader is not currently editing. */
function syncValue(control, value) {
  if (control.value !== value && document.activeElement !== control) control.value = value;
}

/**
 * @param {{
 *   mount: HTMLElement,
 *   labels: object,
 *   t: (key: string, ...params: unknown[]) => string,
 *   onCommand: (command: {type: string, id?: string, patch?: object}) => void
 * }} options
 */
export function createFieldList(options) {
  const { mount, onCommand } = options;
  let labels = options.labels;
  let t = options.t;

  const root = html('div', 'field-list', mount);
  const list = html('div', 'field-rows', root);
  list.setAttribute('role', 'list');

  const empty = html('p', 'fields-empty', root);
  empty.hidden = true;

  const addButton = html('button', 'add-field', root);
  addButton.type = 'button';
  addButton.addEventListener('click', () => onCommand({ type: 'add' }));

  const rows = new Map();

  function createRow(field) {
    const element = html('div', 'field-row');
    element.setAttribute('role', 'listitem');
    element.dataset.id = field.id;

    // Controls and actions share the first line; anything derived from them
    // gets its own line underneath. A field that grows an attribute adds its
    // control to `controls` and needs no layout change: the controls wrap.
    const body = html('div', 'field-body', element);
    const main = html('div', 'field-main', body);
    const controls = html('div', 'field-controls', main);

    const nameLabel = html('label', 'sr-only', controls);
    const name = html('input', 'field-name', controls);
    name.type = 'text';
    name.id = `field-${field.id}-name`;
    name.maxLength = 60;
    name.autocomplete = 'off';
    nameLabel.htmlFor = name.id;

    const kindLabel = html('label', 'sr-only', controls);
    const kind = html('select', 'field-kind', controls);
    kind.id = `field-${field.id}-kind`;
    kindLabel.htmlFor = kind.id;
    const kindOptions = KINDS.map((kindName) => {
      const option = html('option', null, kind);
      option.value = kindName;
      return option;
    });

    const directionLabel = html('label', 'sr-only', controls);
    const direction = html('select', 'field-direction', controls);
    direction.id = `field-${field.id}-direction`;
    directionLabel.htmlFor = direction.id;
    const income = html('option', null, direction);
    income.value = 'income';
    const expense = html('option', null, direction);
    expense.value = 'expense';

    const amountLabel = html('label', 'sr-only', controls);
    const amount = html('input', 'field-amount', controls);
    amount.type = 'number';
    amount.id = `field-${field.id}-amount`;
    amount.inputMode = 'decimal';
    amount.min = '0';
    amount.step = 'any';
    amount.autocomplete = 'off';
    amount.placeholder = '0';
    amountLabel.htmlFor = amount.id;

    const periodLabel = html('label', 'sr-only', controls);
    const period = html('select', 'field-period', controls);
    period.id = `field-${field.id}-period`;
    periodLabel.htmlFor = period.id;
    const periodOptions = PERIODS.map((months) => {
      const option = html('option', null, period);
      option.value = String(months);
      return option;
    });

    const rateLabel = html('label', 'sr-only', controls);
    const rateWrap = html('span', 'field-unit field-unit-rate', controls);
    const rate = html('input', 'field-rate', rateWrap);
    const rateUnit = html('span', 'unit', rateWrap);
    const rateUnitFull = html('span', 'unit-full', rateUnit);
    const rateUnitShort = html('span', 'unit-short', rateUnit);
    rate.type = 'number';
    rate.id = `field-${field.id}-rate`;
    rate.inputMode = 'decimal';
    rate.min = '0';
    rate.step = 'any';
    rate.autocomplete = 'off';
    rateLabel.htmlFor = rate.id;

    const termLabel = html('label', 'sr-only', controls);
    const termWrap = html('span', 'field-unit field-unit-term', controls);
    const term = html('input', 'field-term', termWrap);
    const termUnit = html('span', 'unit', termWrap);
    const termUnitFull = html('span', 'unit-full', termUnit);
    const termUnitShort = html('span', 'unit-short', termUnit);
    term.type = 'number';
    term.id = `field-${field.id}-term`;
    term.inputMode = 'numeric';
    term.min = '1';
    term.step = '1';
    term.autocomplete = 'off';
    termLabel.htmlFor = term.id;

    const actions = html('div', 'field-actions', main);
    const duplicate = html('button', 'icon-button', actions);
    duplicate.type = 'button';
    actionIcon('duplicate', duplicate);
    const remove = html('button', 'icon-button', actions);
    remove.type = 'button';
    actionIcon('remove', remove);

    // What a loan works out to, spelled out where the reader entered it.
    const derived = html('p', 'field-derived', body);
    derived.hidden = true;

    const row = {
      element, name, nameLabel, kind, kindLabel, kindOptions,
      direction, directionLabel, income, expense,
      amount, amountLabel, period, periodLabel, periodOptions,
      rate, rateLabel, rateWrap, rateUnitFull, rateUnitShort,
      term, termLabel, termWrap, termUnitFull, termUnitShort,
      derived, duplicate, remove, shown: '',
    };

    const id = field.id;
    name.addEventListener('input', () => onCommand({ type: 'update', id, patch: { label: name.value } }));
    // Leaving the box settles what was typed: a trimmed name, or — if it was
    // emptied — the field's translated default coming back. A box nobody
    // touched settles nothing: `shown` is what the model last put there.
    name.addEventListener('blur', () => {
      if (name.value === row.shown) return;
      onCommand({ type: 'settle', id, patch: { label: name.value } });
    });
    direction.addEventListener('change', () => onCommand({ type: 'update', id, patch: { direction: direction.value } }));
    amount.addEventListener('input', () => {
      // A negative amount is meaningless here — the direction carries the sign
      // — so drop the sign rather than the digits the reader just typed.
      const typed = Number(amount.value);
      if (amount.value !== '' && Number.isFinite(typed) && typed < 0) {
        amount.value = String(Math.abs(typed));
      }
      onCommand({ type: 'update', id, patch: { amount: amount.value } });
    });
    amount.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { amount: amount.value } }));
    kind.addEventListener('change', () => onCommand({ type: 'update', id, patch: { kind: kind.value } }));
    period.addEventListener('change', () => onCommand({ type: 'update', id, patch: { periodMonths: period.value } }));
    rate.addEventListener('input', () => onCommand({ type: 'update', id, patch: { annualRate: rate.value } }));
    rate.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { annualRate: rate.value } }));
    term.addEventListener('input', () => onCommand({ type: 'update', id, patch: { termMonths: term.value } }));
    term.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { termMonths: term.value } }));
    duplicate.addEventListener('click', () => onCommand({ type: 'duplicate', id }));
    remove.addEventListener('click', () => onCommand({ type: 'remove', id }));

    return row;
  }

  function syncRow(row, field, atCap) {
    const shown = labelOf(field, t);
    const named = shown || labels.untitled;
    row.shown = shown;

    row.nameLabel.textContent = labels.name;
    row.name.placeholder = labels.namePlaceholder;
    syncValue(row.name, shown);

    row.directionLabel.textContent = labels.direction;
    row.income.textContent = labels.income;
    row.expense.textContent = labels.expense;
    syncValue(row.direction, field.direction);

    row.kindLabel.textContent = labels.kind;
    row.kindOptions.forEach((option, index) => {
      option.textContent = labels.kindName(KINDS[index]);
    });
    syncValue(row.kind, field.kind);

    // Each kind asks for what it needs and hides the rest: a loan has a term
    // and no period of its own, an investment is always money going out.
    const isLoan = field.kind === 'loan';
    const isInvestment = field.kind === 'investment';
    setVisible(row.direction, row.directionLabel, !isInvestment);
    setVisible(row.period, row.periodLabel, !isLoan);
    setVisible(row.rateWrap, row.rateLabel, isLoan || isInvestment);
    setVisible(row.termWrap, row.termLabel, isLoan);

    row.amountLabel.textContent = labels.amountFor(field.kind);
    row.amount.placeholder = '0';
    syncValue(row.amount, field.amount);

    row.rateLabel.textContent = labels.rateFor(field.kind);
    row.rate.placeholder = '0';
    row.rateUnitFull.textContent = labels.rateUnit;
    row.rateUnitShort.textContent = labels.rateUnitShort;
    syncValue(row.rate, field.annualRate);

    row.termLabel.textContent = labels.term;
    row.termUnitFull.textContent = labels.termUnit;
    row.termUnitShort.textContent = labels.termUnitShort;
    syncValue(row.term, String(field.termMonths));

    const summary = isLoan ? labels.loanSummary(field) : '';
    row.derived.textContent = summary;
    row.derived.hidden = !summary;

    row.periodLabel.textContent = labels.period;
    row.periodOptions.forEach((option, index) => {
      option.textContent = labels.periodName(PERIODS[index]);
    });
    syncValue(row.period, String(field.periodMonths));

    // Every row would otherwise announce the same three control names, leaving
    // a screen-reader user with no idea which field they are editing. The name
    // box needs no such help: it announces its own value.
    row.element.setAttribute('aria-label', named);
    row.direction.setAttribute('aria-label', labels.directionNamed(named));
    row.amount.setAttribute('aria-label', labels.amountNamed(named));

    row.duplicate.setAttribute('aria-label', labels.duplicateNamed(named));
    // At the cap the model would refuse the copy; say so rather than no-op.
    row.duplicate.disabled = atCap;
    row.remove.setAttribute('aria-label', labels.removeNamed(named));
    row.element.dataset.direction = field.direction;
  }

  return {
    element: root,

    /** Draw `fields`, keeping every row the reader is working in untouched. */
    update(fields, nextLabels, nextT) {
      if (nextLabels) labels = nextLabels;
      if (nextT) t = nextT;

      addButton.textContent = labels.add;
      empty.textContent = labels.empty;

      const atCap = fields.length >= MAX_FIELDS;
      addButton.disabled = atCap;

      let cursor = list.firstChild;
      const present = new Set();
      for (const field of fields) {
        present.add(field.id);
        let row = rows.get(field.id);
        if (!row) {
          row = createRow(field);
          rows.set(field.id, row);
        }
        // Move a row only when its position actually changed: moving a node
        // that holds focus would drop the caret out of it.
        if (row.element !== cursor) list.insertBefore(row.element, cursor);
        else cursor = cursor.nextSibling;
        syncRow(row, field, atCap);
      }

      for (const [id, row] of rows) {
        if (present.has(id)) continue;
        row.element.remove();
        rows.delete(id);
      }

      empty.hidden = fields.length > 0;
    },

    /**
     * Put focus where the reader expects it after a command.
     * @param {string|null} id field to focus, or null for the add button
     * @param {{control?: 'name'|'direction'|'amount', select?: boolean}} [options]
     *   `select` only for a field the reader is about to name — selecting the
     *   text of a neighbour after a deletion would arm the next keystroke to
     *   overwrite a name they meant to keep.
     */
    focus(id, { control = 'name', select = false } = {}) {
      const row = id ? rows.get(id) : null;
      if (!row) {
        addButton.focus();
        return;
      }
      const target = row[control] || row.name;
      target.focus();
      if (select && typeof target.select === 'function') target.select();
    },
  };
}
