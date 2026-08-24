/**
 * strategy-bar.js — switching between strategies and naming them.
 *
 * The active strategy's tab *is* its name box: click a tab to switch, type in
 * it to rename. That way a name lives in one place on screen rather than in a
 * tab and a field that have to agree.
 *
 * With a single strategy there is nothing to switch between, so the bar shows
 * only the invitation to add one.
 */

import { html } from './dom.js';
import { nameOf, MAX_STRATEGIES, MAX_NAME_LENGTH } from './strategies.js';
import { actionIcon } from './field-list.js';

/** Rough auto-size: an input has no intrinsic width, and a fixed one either
 *  truncates a long name or wastes a line on a short one. */
function sizeFor(text) {
  return Math.max(8, Math.min(MAX_NAME_LENGTH, text.length + 1));
}

/**
 * @param {{
 *   mount: HTMLElement, labels: object,
 *   t: (key: string, ...params: unknown[]) => string,
 *   onCommand: (command: {type: string, id?: string, name?: string}) => void
 * }} options
 */
export function createStrategyBar(options) {
  const { mount, onCommand } = options;
  let labels = options.labels;
  let t = options.t;

  const bar = html('div', 'strategy-bar', mount);
  const tabs = html('div', 'strategy-tabs', bar);
  tabs.setAttribute('role', 'group');
  const actions = html('div', 'strategy-actions', bar);

  const remove = html('button', 'icon-button', actions);
  remove.type = 'button';
  actionIcon('remove', remove);
  remove.addEventListener('click', () => onCommand({ type: 'remove' }));

  const add = html('button', 'add-strategy', bar);
  add.type = 'button';
  add.addEventListener('click', () => onCommand({ type: 'add' }));

  const entries = new Map();

  function createEntry(strategy) {
    const wrap = html('div', 'strategy-tab-wrap');
    const id = strategy.id;

    const button = html('button', 'strategy-tab', wrap);
    button.type = 'button';
    button.addEventListener('click', () => onCommand({ type: 'select', id }));

    const input = html('input', 'strategy-name', wrap);
    input.type = 'text';
    input.maxLength = MAX_NAME_LENGTH;
    input.autocomplete = 'off';
    input.addEventListener('input', () => {
      input.size = sizeFor(input.value);
      onCommand({ type: 'rename', id, name: input.value });
    });
    // Leaving the box settles it: a trimmed name, or the position back again
    // if it was emptied.
    input.addEventListener('blur', () => onCommand({ type: 'settle', id, name: input.value }));

    const entry = { wrap, button, input, shown: '' };
    entries.set(id, entry);
    return entry;
  }

  return {
    element: bar,

    update(strategies, activeId, nextLabels, nextT) {
      if (nextLabels) labels = nextLabels;
      if (nextT) t = nextT;

      const comparing = strategies.length > 1;
      tabs.hidden = !comparing;
      actions.hidden = !comparing;
      tabs.setAttribute('aria-label', labels.tabsAria);
      add.textContent = comparing ? labels.add : labels.addFirst;
      add.disabled = strategies.length >= MAX_STRATEGIES;
      remove.disabled = strategies.length <= 1;

      let cursor = tabs.firstChild;
      const present = new Set();
      strategies.forEach((strategy, index) => {
        present.add(strategy.id);
        const entry = entries.get(strategy.id) || createEntry(strategy);
        if (entry.wrap !== cursor) tabs.insertBefore(entry.wrap, cursor);
        else cursor = cursor.nextSibling;

        const shown = nameOf(strategy, index, t);
        const active = strategy.id === activeId;

        entry.button.hidden = active;
        entry.input.hidden = !active;
        entry.button.textContent = shown;
        entry.button.setAttribute('aria-label', labels.switchTo(shown));

        entry.input.setAttribute('aria-label', labels.nameAria);
        entry.input.placeholder = labels.namePlaceholder;
        entry.input.size = sizeFor(shown);
        if (entry.input.value !== shown && document.activeElement !== entry.input) {
          entry.input.value = shown;
        }
        entry.shown = shown;

        if (active) remove.setAttribute('aria-label', labels.removeNamed(shown));
      });

      for (const [id, entry] of entries) {
        if (present.has(id)) continue;
        entry.wrap.remove();
        entries.delete(id);
      }
    },

    /** Put the caret in a strategy's name, ready to be typed over. */
    focusName(id) {
      const entry = entries.get(id);
      if (!entry) {
        add.focus();
        return;
      }
      entry.input.focus();
      entry.input.select();
    },
  };
}
