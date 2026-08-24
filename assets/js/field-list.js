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

import { labelOf, MAX_FIELDS } from './fields.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  duplicate: ['M9 9h9.5a1.5 1.5 0 0 1 1.5 1.5V20a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 20v-9.5A1.5 1.5 0 0 1 9 9Z', 'M16.5 6H6a1.5 1.5 0 0 0-1.5 1.5V18'],
  remove: ['M5.5 7.5h13', 'M10 7.5V6a1.5 1.5 0 0 1 1.5-1.5h1A1.5 1.5 0 0 1 14 6v1.5', 'M7 7.5V19a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 19V7.5'],
};

function html(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

function icon(name, parent) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'action-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  parent.appendChild(svg);
  return svg;
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

    const nameLabel = html('label', 'sr-only', element);
    const name = html('input', 'field-name', element);
    name.type = 'text';
    name.id = `field-${field.id}-name`;
    name.maxLength = 60;
    name.autocomplete = 'off';
    nameLabel.htmlFor = name.id;

    const directionLabel = html('label', 'sr-only', element);
    const direction = html('select', 'field-direction', element);
    direction.id = `field-${field.id}-direction`;
    directionLabel.htmlFor = direction.id;
    const income = html('option', null, direction);
    income.value = 'income';
    const expense = html('option', null, direction);
    expense.value = 'expense';

    const amountLabel = html('label', 'sr-only', element);
    const amount = html('input', 'field-amount', element);
    amount.type = 'number';
    amount.id = `field-${field.id}-amount`;
    amount.inputMode = 'decimal';
    amount.min = '0';
    amount.step = 'any';
    amount.autocomplete = 'off';
    amount.placeholder = '0';
    amountLabel.htmlFor = amount.id;

    const actions = html('div', 'field-actions', element);
    const duplicate = html('button', 'icon-button', actions);
    duplicate.type = 'button';
    icon('duplicate', duplicate);
    const remove = html('button', 'icon-button', actions);
    remove.type = 'button';
    icon('remove', remove);

    const id = field.id;
    name.addEventListener('input', () => onCommand({ type: 'update', id, patch: { label: name.value } }));
    // Leaving the box settles what was typed: a trimmed name, or — if it was
    // emptied — the field's translated default coming back.
    name.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { label: name.value } }));
    direction.addEventListener('change', () => onCommand({ type: 'update', id, patch: { direction: direction.value } }));
    amount.addEventListener('input', () => {
      // A negative amount is meaningless: the direction carries the sign.
      if (amount.value !== '' && Number(amount.value) < 0) amount.value = '';
      onCommand({ type: 'update', id, patch: { amount: amount.value } });
    });
    amount.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { amount: amount.value } }));
    duplicate.addEventListener('click', () => onCommand({ type: 'duplicate', id }));
    remove.addEventListener('click', () => onCommand({ type: 'remove', id }));

    return {
      element, name, nameLabel, direction, directionLabel, income, expense,
      amount, amountLabel, duplicate, remove,
    };
  }

  function syncRow(row, field, atCap) {
    const shown = labelOf(field, t);
    const named = shown || labels.untitled;

    row.nameLabel.textContent = labels.name;
    row.name.placeholder = labels.namePlaceholder;
    syncValue(row.name, shown);

    row.directionLabel.textContent = labels.direction;
    row.income.textContent = labels.income;
    row.expense.textContent = labels.expense;
    syncValue(row.direction, field.direction);

    row.amountLabel.textContent = labels.amount;
    syncValue(row.amount, field.amount);

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
     * @param {'name'|'direction'|'amount'} [control]
     */
    focus(id, control = 'name') {
      const row = id ? rows.get(id) : null;
      if (!row) {
        addButton.focus();
        return;
      }
      const target = row[control] || row.name;
      target.focus();
      if (target === row.name && typeof target.select === 'function') target.select();
    },
  };
}
