/**
 * strategy-bar.js — switching between strategies and naming them.
 *
 * The active strategy's tab *is* its name box: click a tab to switch, type in
 * it to rename. That way a name lives in one place on screen rather than in a
 * tab and a field that have to agree.
 *
 * With a single strategy there is nothing to switch between, so the bar shows
 * only the invitation to add one.
 *
 * `createStrategyJump` is the same switch, kept within reach: the bar above
 * lives at the top of the form, and by the time you are reading a chart it is
 * several screens away. It carries names and nothing else — renaming, adding
 * and removing stay in one place, so there is never a second box claiming to
 * hold the same name.
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
    // if it was emptied. Only if something was actually typed, though — the
    // box shows a name the app gave the plan, so settling an untouched one
    // stored that name as the reader's own and it stopped following the
    // language for good. One Tab through the box was enough to do it.
    const entry = { wrap, button, input, shown: '' };
    input.addEventListener('blur', () => {
      if (input.value === entry.shown) return;
      onCommand({ type: 'settle', id, name: input.value });
    });

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

/**
 * The switch again, pinned to the top of the window, shown only once the real
 * bar has scrolled away and only when there is something to switch between.
 *
 * Fixed rather than sticky on purpose: a sticky element still takes its space
 * in the flow, so revealing one while the reader is halfway down the page
 * pushes everything they are looking at down by its height. Fixed costs a
 * strip of the viewport and moves nothing.
 *
 * @param {{
 *   mount: HTMLElement, watch: HTMLElement, labels: object,
 *   t: (key: string, ...params: unknown[]) => string,
 *   onCommand: (command: {type: string, id?: string}) => void
 * }} options
 */
export function createStrategyJump(options) {
  const { mount, watch, onCommand } = options;
  let labels = options.labels;
  let t = options.t;

  const bar = html('div', 'strategy-jump', mount);
  const tabs = html('div', 'strategy-jump-tabs', bar);
  tabs.setAttribute('role', 'group');
  bar.hidden = true;

  const entries = new Map();
  let comparing = false;
  let away = false;
  let current = null;

  /** Scroll the row — never the page — so the name you are on is on screen.
   *  With four long names the row overflows, and the one that must not be the
   *  one off the edge is the one saying where you are. */
  function reveal(button) {
    if (!button || bar.hidden) return;
    const row = tabs.getBoundingClientRect();
    const mark = button.getBoundingClientRect();
    if (mark.left < row.left) tabs.scrollLeft -= (row.left - mark.left) + 8;
    else if (mark.right > row.right) tabs.scrollLeft += (mark.right - row.right) + 8;
  }

  // Two conditions, one answer: there has to be something to switch between,
  // and the switch that is already on screen has to be off it.
  function settle() {
    const was = bar.hidden;
    bar.hidden = !(comparing && away);
    // Nothing can be measured while it is hidden, so the first look at the row
    // has to wait until it is not.
    if (was && !bar.hidden) reveal(current);
  }

  function createEntry(id) {
    const button = html('button', 'strategy-jump-tab');
    button.type = 'button';
    button.addEventListener('click', () => onCommand({ type: 'select', id }));
    const entry = { button };
    entries.set(id, entry);
    return entry;
  }

  const observer = typeof window.IntersectionObserver === 'function'
    ? new window.IntersectionObserver(([record]) => {
      away = !record.isIntersecting;
      settle();
    }, { threshold: 0 })
    : null;
  if (observer) observer.observe(watch);
  else {
    // Without it, ask the same question on scroll. Passive: this must never be
    // the reason a page stutters under the reader's thumb.
    const check = () => {
      away = watch.getBoundingClientRect().bottom <= 0;
      settle();
    };
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    check();
  }

  return {
    element: bar,

    update(strategies, activeId, nextLabels, nextT) {
      if (nextLabels) labels = nextLabels;
      if (nextT) t = nextT;

      comparing = strategies.length > 1;
      settle();
      tabs.setAttribute('aria-label', labels.jumpAria);
      if (!comparing) return;

      let cursor = tabs.firstChild;
      const present = new Set();
      strategies.forEach((strategy, index) => {
        present.add(strategy.id);
        const entry = entries.get(strategy.id) || createEntry(strategy.id);
        if (entry.button !== cursor) tabs.insertBefore(entry.button, cursor);
        else cursor = cursor.nextSibling;

        const shown = nameOf(strategy, index, t);
        const active = strategy.id === activeId;
        entry.button.textContent = shown;
        // The one you are on is marked rather than removed: a row that drops
        // the name you are reading is a row that moves under your finger.
        if (active) entry.button.setAttribute('aria-current', 'true');
        else entry.button.removeAttribute('aria-current');
        entry.button.setAttribute('aria-label', active
          ? labels.onNamed(shown)
          : labels.switchTo(shown));
        if (active) current = entry.button;
      });

      for (const [id, entry] of entries) {
        if (present.has(id)) continue;
        entry.button.remove();
        entries.delete(id);
      }

      reveal(current);
    },
  };
}
