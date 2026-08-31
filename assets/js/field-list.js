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
import { toNumber } from './projection.js';
import { formatTyped } from './format.js';
import { html, setVisible, svgEl, syncValue } from './dom.js';

const ACTION_ICONS = {
  // Two links of a chain: the field is joined to its counterparts elsewhere.
  sync: ['M10.4 13.6a3.8 3.8 0 0 0 5.4 0l2.8-2.8a3.8 3.8 0 1 0-5.4-5.4l-1.4 1.4', 'M13.6 10.4a3.8 3.8 0 0 0-5.4 0l-2.8 2.8a3.8 3.8 0 1 0 5.4 5.4l1.4-1.4'],
  duplicate: ['M9 9h9.5a1.5 1.5 0 0 1 1.5 1.5V20a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 20v-9.5A1.5 1.5 0 0 1 9 9Z', 'M16.5 6H6a1.5 1.5 0 0 0-1.5 1.5V18'],
  remove: ['M5.5 7.5h13', 'M10 7.5V6a1.5 1.5 0 0 1 1.5-1.5h1A1.5 1.5 0 0 1 14 6v1.5', 'M7 7.5V19a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 19V7.5'],
  // Points down at what is folded away, and the CSS turns it over when the row
  // is open. Drawn low in the box on purpose: it is a disclosure, not an arrow.
  chevron: ['M6 10.5 12 16l6-5.5'],
};

/** One of the row action icons, also used by the strategy bar. */
export function actionIcon(name, parent) {
  const node = svgEl('svg', {
    class: 'action-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
  }, parent);
  for (const d of ACTION_ICONS[name]) svgEl('path', { d }, node);
  return node;
}

/**
 * @param {{
 *   mount: HTMLElement,
 *   labels: object,
 *   t: (key: string, ...params: unknown[]) => string,
 *   onCommand: (command: {type: string, id?: string, patch?: object}) => void
 * }} options
 */
/**
 * Fill a select from a list that changes, keeping the choice where the thing it
 * named is still on offer. Rebuilt only when the set of values changes, so the
 * common render — the same targets, different labels — touches text and nothing
 * else, and a select the reader has open is not torn out from under them.
 */
function syncOptions(select, entries) {
  const shape = entries.map((entry) => entry.value).join('\n');
  if (select.dataset.shape !== shape) {
    const chosen = select.value;
    select.dataset.shape = shape;
    select.textContent = '';
    for (const entry of entries) {
      const option = html('option', null, select);
      option.value = entry.value;
    }
    if (entries.some((entry) => entry.value === chosen)) select.value = chosen;
  }
  entries.forEach((entry, index) => {
    if (select.options[index].textContent !== entry.name) select.options[index].textContent = entry.name;
  });
}

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

    // A row is a head and a fold. The head is the 44px that never goes away —
    // which field this is, and how much of it — and the fold holds everything
    // that qualifies those two: what kind of thing it is, which way the money
    // runs, how often it lands, over what window. Between them sits one line
    // that is the arithmetic while the row is open and a description of the
    // fold while it is shut, so nothing behind the chevron is ever a surprise.
    const body = html('div', 'field-body', element);
    const head = html('div', 'field-head', body);

    const nameLabel = html('label', 'sr-only', head);
    const name = html('input', 'field-name', head);
    name.type = 'text';
    name.id = `field-${field.id}-name`;
    name.maxLength = 60;
    name.autocomplete = 'off';
    nameLabel.htmlFor = name.id;

    const amountLabel = html('label', 'sr-only', head);
    const amount = html('input', 'field-amount', head);
    // Text, not number: a number box parses by the browser's locale, and a
    // comma typed into one where that locale does not use it is dropped before
    // any of this can see it — twelve-fifty arriving as 1250. `toNumber` reads
    // the separators instead.
    amount.type = 'text';
    amount.id = `field-${field.id}-amount`;
    amount.inputMode = 'decimal';
    amount.autocomplete = 'off';
    amount.placeholder = '0';
    amountLabel.htmlFor = amount.id;

    const toggle = html('button', 'icon-button field-toggle', head);
    toggle.type = 'button';
    actionIcon('chevron', toggle);

    // What a loan works out to, under the row that describes it — and, while
    // the row is shut, what the fold is holding.
    const derived = html('p', 'field-derived', body);
    derived.hidden = true;

    // Everything the head cannot carry, in the order the shut row's sentence
    // reads it. A field that grows an attribute adds its control here and
    // needs no layout change: the grid gives it a cell, and a control the kind
    // does not offer is `hidden` and vacates the one it had.
    const detail = html('div', 'field-detail', body);
    detail.id = `field-${field.id}-detail`;
    toggle.setAttribute('aria-controls', detail.id);

    const kindLabel = html('label', 'sr-only', detail);
    const kind = html('select', 'field-kind', detail);
    kind.id = `field-${field.id}-kind`;
    kindLabel.htmlFor = kind.id;
    const kindOptions = KINDS.map((kindName) => {
      const option = html('option', null, kind);
      option.value = kindName;
      return option;
    });

    const directionLabel = html('label', 'sr-only', detail);
    const direction = html('select', 'field-direction', detail);
    direction.id = `field-${field.id}-direction`;
    directionLabel.htmlFor = direction.id;
    const income = html('option', null, direction);
    income.value = 'income';
    const expense = html('option', null, direction);
    expense.value = 'expense';

    const periodLabel = html('label', 'sr-only', detail);
    const period = html('select', 'field-period', detail);
    period.id = `field-${field.id}-period`;
    periodLabel.htmlFor = period.id;
    const periodOptions = PERIODS.map((months) => {
      const option = html('option', null, period);
      option.value = String(months);
      return option;
    });

    const rateLabel = html('label', 'sr-only', detail);
    const rateWrap = html('span', 'field-unit field-unit-rate', detail);
    const rate = html('input', 'field-rate', rateWrap);
    const rateUnit = html('span', 'unit', rateWrap);
    const rateUnitFull = html('span', 'unit-full', rateUnit);
    const rateUnitShort = html('span', 'unit-short', rateUnit);
    rate.type = 'text';
    rate.id = `field-${field.id}-rate`;
    rate.inputMode = 'decimal';
    rate.autocomplete = 'off';
    rateLabel.htmlFor = rate.id;

    const termLabel = html('label', 'sr-only', detail);
    const termWrap = html('span', 'field-unit field-unit-term', detail);
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

    // The fees box used to sit beside the amount, because the two are read
    // together: what you need, and what the lender adds to it. The amount has
    // gone up into the head, so it sits after the term instead — and on the
    // only kind that shows it, a loan, direction and period are hidden, so the
    // cells read kind, rate, term, fees, window. That is the same sentence in
    // the same order the shut row says it in.
    const feesLabel = html('label', 'sr-only', detail);
    const feesWrap = html('span', 'field-unit field-unit-fees', detail);
    const fees = html('input', 'field-fees', feesWrap);
    const feesUnit = html('span', 'unit', feesWrap);
    const feesUnitFull = html('span', 'unit-full', feesUnit);
    const feesUnitShort = html('span', 'unit-short', feesUnit);
    fees.type = 'text';
    fees.id = `field-${field.id}-fees`;
    fees.inputMode = 'decimal';
    fees.autocomplete = 'off';
    fees.placeholder = '0';
    feesLabel.htmlFor = fees.id;

    // When a field runs. The word comes *before* the box here — "from month 6"
    // reads as a sentence where a trailing unit would not.
    // The three boxes take a line of their own, so a window is read as one
    // thing rather than as two numbers that happened to land side by side.
    const window = html('span', 'field-window', detail);
    const fromLabel = html('label', 'sr-only', window);
    const fromWrap = html('span', 'field-when field-when-from', window);
    const fromUnit = html('span', 'when-word', fromWrap);
    const fromWordFull = html('span', 'unit-full', fromUnit);
    const fromWordShort = html('span', 'unit-short', fromUnit);
    const from = html('input', 'field-from', fromWrap);
    from.type = 'number';
    from.id = `field-${field.id}-from`;
    from.inputMode = 'numeric';
    from.min = '1';
    from.step = '1';
    from.autocomplete = 'off';
    fromLabel.htmlFor = from.id;
    // A month can be a figure or a named target. The picker is hidden outright
    // until a target has a name, so a reader who never names one never learns
    // that any of this exists; when one is chosen the box gives way to the
    // month it resolved to, because a number nobody typed is a reading rather
    // than a control.
    const fromAt = html('select', 'field-at', fromWrap);
    fromAt.id = `field-${field.id}-from-at`;
    const fromSaid = html('span', 'field-at-said', fromWrap);

    // Only an investment can be cashed in, so this sits with the window rather
    // than beside the amount: it is a date, and it is when the holding ends.
    const sellLabel = html('label', 'sr-only', window);
    const sellWrap = html('span', 'field-when field-when-sell', window);
    const sellUnit = html('span', 'when-word', sellWrap);
    const sellWordFull = html('span', 'unit-full', sellUnit);
    const sellWordShort = html('span', 'unit-short', sellUnit);
    const sell = html('input', 'field-sell', sellWrap);
    sell.type = 'number';
    sell.id = `field-${field.id}-sell`;
    sell.inputMode = 'numeric';
    sell.min = '1';
    sell.step = '1';
    sell.autocomplete = 'off';
    sellLabel.htmlFor = sell.id;
    // A month can be a figure or a named target. The picker is hidden outright
    // until a target has a name, so a reader who never names one never learns
    // that any of this exists; when one is chosen the box gives way to the
    // month it resolved to, because a number nobody typed is a reading rather
    // than a control.
    const sellAt = html('select', 'field-at', sellWrap);
    sellAt.id = `field-${field.id}-sell-at`;
    const sellSaid = html('span', 'field-at-said', sellWrap);

    const toLabel = html('label', 'sr-only', window);
    const toWrap = html('span', 'field-when field-when-to', window);
    const toUnit = html('span', 'when-word', toWrap);
    const toWordFull = html('span', 'unit-full', toUnit);
    const toWordShort = html('span', 'unit-short', toUnit);
    const to = html('input', 'field-to', toWrap);
    to.type = 'number';
    to.id = `field-${field.id}-to`;
    to.inputMode = 'numeric';
    to.min = '1';
    to.step = '1';
    to.autocomplete = 'off';
    toLabel.htmlFor = to.id;
    // A month can be a figure or a named target. The picker is hidden outright
    // until a target has a name, so a reader who never names one never learns
    // that any of this exists; when one is chosen the box gives way to the
    // month it resolved to, because a number nobody typed is a reading rather
    // than a control.
    const toAt = html('select', 'field-at', toWrap);
    toAt.id = `field-${field.id}-to-at`;
    const toSaid = html('span', 'field-at-said', toWrap);


    const actions = html('div', 'field-actions', detail);
    // Only worth showing once there is another strategy for a field to be the
    // same as; with one plan there is nothing to keep in step.
    const sync = html('button', 'icon-button', actions);
    sync.type = 'button';
    actionIcon('sync', sync);
    const duplicate = html('button', 'icon-button', actions);
    duplicate.type = 'button';
    actionIcon('duplicate', duplicate);
    const remove = html('button', 'icon-button', actions);
    remove.type = 'button';
    actionIcon('remove', remove);

    const row = {
      element, name, nameLabel, kind, kindLabel, kindOptions,
      direction, directionLabel, income, expense,
      amount, amountLabel, period, periodLabel, periodOptions,
      window,
      from, fromLabel, fromWrap, fromWordFull, fromWordShort,
      fromAt, fromSaid, sellAt, sellSaid, toAt, toSaid,
      to, toLabel, toWrap, toWordFull, toWordShort,
      sell, sellLabel, sellWrap, sellWordFull, sellWordShort,
      fees, feesLabel, feesWrap, feesUnitFull, feesUnitShort,
      rate, rateLabel, rateWrap, rateUnitFull, rateUnitShort,
      term, termLabel, termWrap, termUnitFull, termUnitShort,
      derived, sync, duplicate, remove, shown: '',
      head, detail, toggle,
      // A field with no amount yet is one the reader is still filling in, so it
      // arrives open: needing a click to reach the boxes you were sent here to
      // fill would be a fold working against the reader. Evaluated once, here,
      // and never again — clearing an amount mid-edit must not pop a row open
      // under the caret.
      open: !String(field.amount).trim(),
      // The arguments of the last `syncRow`, so the row can redraw itself when
      // nothing about the model changed and only the way it is being looked at
      // did. One redraw path rather than two: whatever `syncRow` does for the
      // list, the chevron gets exactly the same.
      last: null,
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
      const typed = toNumber(amount.value);
      if (amount.value !== '' && Number.isFinite(typed) && typed < 0) {
        amount.value = formatTyped(Math.abs(typed));
      }
      onCommand({ type: 'update', id, patch: { amount: amount.value } });
    });
    amount.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { amount: amount.value } }));
    kind.addEventListener('change', () => onCommand({ type: 'update', id, patch: { kind: kind.value } }));
    period.addEventListener('change', () => onCommand({ type: 'update', id, patch: { periodMonths: period.value } }));
    fees.addEventListener('input', () => {
      // Negative fees would be a lender paying you to borrow; the same rule the
      // amount follows, for the same reason.
      const typed = toNumber(fees.value);
      if (fees.value !== '' && Number.isFinite(typed) && typed < 0) {
        fees.value = formatTyped(Math.abs(typed));
      }
      onCommand({ type: 'update', id, patch: { fees: fees.value } });
    });
    fees.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { fees: fees.value } }));
    rate.addEventListener('input', () => onCommand({ type: 'update', id, patch: { annualRate: rate.value } }));
    rate.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { annualRate: rate.value } }));
    term.addEventListener('input', () => onCommand({ type: 'update', id, patch: { termMonths: term.value } }));
    term.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { termMonths: term.value } }));
    // An empty box is "not set", which the model reads as 0 — from the
    // beginning, or with no end.
    for (const [picker, key] of [[fromAt, 'startAt'], [sellAt, 'sellAt'], [toAt, 'endAt']]) {
      picker.addEventListener('change', () => onCommand({ type: 'update', id, patch: { [key]: picker.value } }));
    }
    from.addEventListener('input', () => onCommand({ type: 'update', id, patch: { startMonth: from.value } }));
    sell.addEventListener('input', () => onCommand({ type: 'update', id, patch: { sellMonth: sell.value } }));
    sell.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { sellMonth: sell.value } }));
    to.addEventListener('input', () => onCommand({ type: 'update', id, patch: { endMonth: to.value } }));
    // Every other numeric box settles on blur, and these two need it as much:
    // `normalizeField` clamps an end back up to its beginning, and gives a
    // one-off at least month 1 — corrections `syncValue` refuses to write while
    // the reader is still in the box, so without a settle the row goes on
    // showing a number the projection has already thrown away.
    from.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { startMonth: from.value } }));
    to.addEventListener('blur', () => onCommand({ type: 'settle', id, patch: { endMonth: to.value } }));

    // No command, and so no undo entry and nothing stored: whether a row is
    // folded is how it is being looked at, not part of the plan. Two readers
    // sharing a link should not inherit each other's folds.
    toggle.addEventListener('click', () => {
      row.open = !row.open;
      if (row.last) syncRow(row, ...row.last);
    });

    sync.addEventListener('click', () => onCommand({ type: 'sync', id }));
    duplicate.addEventListener('click', () => onCommand({ type: 'duplicate', id }));
    remove.addEventListener('click', () => onCommand({ type: 'remove', id }));

    return row;
  }

  function syncRow(row, field, atCap, comparing) {
    // Kept so the chevron can ask for the same draw the list would have given
    // it. Everything below reads `row.open`, so folding a row is one more call
    // to this function rather than a second, quieter way of updating a row.
    row.last = [field, atCap, comparing];
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
    // and no period of its own, an investment is always money going out, and an
    // asset moves no cash at all — so it has neither a direction nor a period.
    const isLoan = field.kind === 'loan';
    const isInvestment = field.kind === 'investment';
    const isAsset = field.kind === 'asset';
    const isOnce = field.kind === 'once';
    setVisible(row.direction, row.directionLabel, !isInvestment && !isAsset);
    setVisible(row.period, row.periodLabel, !isLoan && !isAsset && !isOnce);
    // A plain amount takes a rate too: what it does to itself each year. A
    // one-off has no years to do it over, so it is the one kind without one.
    setVisible(row.rateWrap, row.rateLabel, !isOnce);
    setVisible(row.termWrap, row.termLabel, isLoan);
    // Only a loan has anything added to what it lends.
    setVisible(row.feesWrap, row.feesLabel, isLoan);
    // A one-off has a month rather than a window; a loan's term is its end; an
    // asset never lands at all.
    // An asset takes a start too, now that owning one can begin at a month.
    setVisible(row.fromWrap, row.fromLabel, true);
    setVisible(row.toWrap, row.toLabel, !isAsset && !isLoan && !isOnce);
    setVisible(row.sellWrap, row.sellLabel, isInvestment);
    // An empty group would still take its gap in the row.
    // Every kind carries a window of some sort now; which boxes it shows is
    // settled above, kind by kind.
    row.window.hidden = false;

    row.fromLabel.textContent = isOnce ? labels.onceMonth : (isAsset ? labels.ownedFrom : labels.from);
    row.fromWordFull.textContent = isOnce ? labels.onceWord : labels.fromWord;
    row.fromWordShort.textContent = isOnce ? labels.onceWordShort : labels.fromWordShort;
    row.from.placeholder = '';
    // One place decides, for all three, whether a month is a box or a reading.
    for (const [picker, said, box, boxLabel, key, wrap] of [
      [row.fromAt, row.fromSaid, row.from, row.fromLabel, 'startAt', row.fromWrap],
      [row.sellAt, row.sellSaid, row.sell, row.sellLabel, 'sellAt', row.sellWrap],
      [row.toAt, row.toSaid, row.to, row.toLabel, 'endAt', row.toWrap],
    ]) {
      const waiting = labels.targets.length > 0;
      // The picker and the reading carry their own accessible names rather than
      // a paired <label>, so they are hidden on their own; the number box has
      // one, and goes with it.
      picker.hidden = !waiting;
      // A month box was sized for a world without the picker; with one beside
      // it the select came out around 30px, an arrow with nothing readable in
      // it. So the box takes the whole line while the picker is there. A class
      // set here rather than a `:has()` in the stylesheet, because that is how
      // every other per-row state in this file is carried, and because it keeps
      // the rule inside the row's own reconciliation.
      wrap.classList.toggle('is-picking', waiting);
      if (waiting) {
        syncOptions(picker, [{ value: '', name: labels.atMonth }, ...labels.targets.map((one) => ({ value: one.id, name: one.name }))]);
        picker.setAttribute('aria-label', labels.atAria(named));
        if (picker.value !== field[key]) picker.value = field[key];
        // A target that has since been unnamed or removed leaves the field
        // waiting on nothing, which the select cannot show; fall back to the
        // month box rather than to a blank the reader cannot act on.
        if (picker.value !== field[key]) onCommand({ type: 'update', id: field.id, patch: { [key]: '' } });
      }
      const chosen = waiting && Boolean(picker.value);
      setVisible(box, boxLabel, !chosen);
      // The leading word is painted over the number box, which is how "from
      // month 6" reads as a phrase. With the box gone there is nothing under it
      // and it would sit on top of the target's name instead, so it steps back
      // into the flow and leads the picker the same way it led the box.
      wrap.classList.toggle('is-said', chosen);
      said.hidden = !chosen;
      if (chosen) said.textContent = labels.monthSaid(picker.value);
    }

    syncValue(row.from, field.startMonth ? String(field.startMonth) : '');

    row.sellLabel.textContent = labels.sell;
    row.sellWordFull.textContent = labels.sellWord;
    row.sellWordShort.textContent = labels.sellWordShort;
    row.sell.placeholder = '';
    syncValue(row.sell, field.sellMonth ? String(field.sellMonth) : '');

    row.toLabel.textContent = labels.to;
    row.toWordFull.textContent = labels.toWord;
    row.toWordShort.textContent = labels.toWordShort;
    row.to.placeholder = '';
    syncValue(row.to, field.endMonth ? String(field.endMonth) : '');

    row.amountLabel.textContent = labels.amountFor(field.kind);
    row.amount.placeholder = '0';
    syncValue(row.amount, field.amount);

    row.feesLabel.textContent = labels.fees;
    row.feesUnitFull.textContent = labels.feesUnit;
    row.feesUnitShort.textContent = labels.feesUnitShort;
    row.fees.placeholder = '0';
    syncValue(row.fees, field.fees);

    row.rateLabel.textContent = labels.rateFor(field.kind);
    row.rate.placeholder = '0';
    row.rateUnitFull.textContent = labels.rateUnit;
    row.rateUnitShort.textContent = labels.rateUnitShort;
    syncValue(row.rate, field.annualRate);

    row.termLabel.textContent = labels.term;
    row.termUnitFull.textContent = labels.termUnit;
    row.termUnitShort.textContent = labels.termUnitShort;
    syncValue(row.term, String(field.termMonths));

    // What a loan works out to, or what a climbing amount climbs to: both are
    // arithmetic the reader would otherwise have to do in their head.
    let summary = '';
    if (isLoan) summary = labels.loanSummary(field);
    else if (field.kind === 'plain') summary = labels.growthSummary(field);
    // One line, two jobs. Shut, it says which field this is — kind, direction,
    // cadence, term, a set rate and every set month — because the name and the
    // amount above it cannot carry any of that. Open, it goes back to being the
    // arithmetic, which is the thing you want in front of you while you edit.
    const said = row.open ? summary : labels.saidFor(field);
    row.derived.textContent = said;
    row.derived.hidden = !said;

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
    // The sr-only label says what this box means for this kind of field; an
    // aria-label would replace it outright, so it carries that wording too.
    // Without this every box announced "Amount each month" — for a loan you are
    // borrowing once, for a house you already own, for a yearly bill.
    row.amount.setAttribute('aria-label', labels.amountNamed(labels.amountFor(field.kind), named));

    // The chevron is the one control on the row whose label changes with what
    // pressing it would do, so it says both which field it belongs to and which
    // way it goes. `aria-expanded` says the same thing a second way, for the
    // reader whose screen reader announces state rather than the whole name.
    row.element.classList.toggle('is-open', row.open);
    row.toggle.setAttribute('aria-expanded', row.open ? 'true' : 'false');
    row.toggle.setAttribute('aria-label', row.open ? labels.closeNamed(named) : labels.openNamed(named));

    row.sync.hidden = !comparing;
    row.sync.setAttribute('aria-pressed', field.synced ? 'true' : 'false');
    row.sync.setAttribute(
      'aria-label',
      field.synced ? labels.unsyncNamed(named) : labels.syncNamed(named),
    );
    row.sync.title = field.synced ? labels.syncedTitle : labels.syncTitle;

    row.duplicate.setAttribute('aria-label', labels.duplicateNamed(named));
    // At the cap the model would refuse the copy; say so rather than no-op.
    row.duplicate.disabled = atCap;
    row.remove.setAttribute('aria-label', labels.removeNamed(named));
    // The stripe repeats what the direction select says — except on the two
    // kinds that hide the select, where it is the only thing saying it. An
    // asset is the worse of the two: `normalizeField` calls it income purely as
    // bookkeeping, so it wore the income colour while moving no cash at all.
    row.element.dataset.direction = isAsset ? 'none' : field.direction;
  }

  return {
    element: root,

    /** Draw `fields`, keeping every row the reader is working in untouched. */
    update(fields, nextLabels, nextT, { comparing = false } = {}) {
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
        syncRow(row, field, atCap, comparing);
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
      // A field you have just made arrives ready to fill in, fold and all:
      // `select` is passed only by add and duplicate, which are the two
      // commands that make one. Every focus target here lives in the head,
      // which never folds, so this is about what the reader does next rather
      // than about reaching the box.
      if (select) {
        row.open = true;
        if (row.last) syncRow(row, ...row.last);
      }
      const target = row[control] || row.name;
      target.focus();
      if (select && typeof target.select === 'function') target.select();
    },
  };
}
