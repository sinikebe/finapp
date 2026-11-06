/** Scenario selection and explicit renaming; a compact switch follows the scroll. */

import { html } from './dom.js';
import { nameOf, originStateOf, MAX_STRATEGIES, MAX_NAME_LENGTH } from './strategies.js';

export function createStrategyBar(options) {
  const { mount, onCommand } = options;
  let t = options.t;
  let current = null;
  let currentIndex = 0;
  let renaming = false;
  const bar = html('div', 'strategy-bar', mount);
  const label = html('label', 'control-label', bar);
  const select = html('select', 'scenario-select', bar);
  select.id = 'scenario-active';
  label.htmlFor = select.id;
  const currentName = html('p', 'scenario-current', bar);
  const origin = html('span', 'origin-badge', bar);
  const actions = html('div', 'strategy-actions', bar);
  const rename = html('button', 'ghost-button', actions);
  rename.type = 'button';
  const add = html('button', 'ghost-button', actions);
  add.type = 'button';
  const remove = html('button', 'ghost-button', actions);
  remove.type = 'button';
  const editor = html('form', 'scenario-rename', bar);
  editor.hidden = true;
  const nameLabel = html('label', 'control-label', editor);
  const input = html('input', 'strategy-name', editor);
  input.id = 'scenario-name';
  input.maxLength = MAX_NAME_LENGTH;
  nameLabel.htmlFor = input.id;
  const done = html('button', 'ghost-button', editor);
  done.type = 'submit';
  const cancel = html('button', 'ghost-button', editor);
  cancel.type = 'button';
  function close() { renaming = false; editor.hidden = true; rename.focus(); }
  function open() {
    if (!current) return;
    renaming = true;
    editor.hidden = false;
    input.value = nameOf(current, currentIndex, t);
    input.focus(); input.select();
  }
  select.addEventListener('change', () => { renaming = false; editor.hidden = true; onCommand({ type: 'select', id: select.value }); });
  rename.addEventListener('click', open);
  add.addEventListener('click', () => onCommand({ type: 'add' }));
  remove.addEventListener('click', () => onCommand({ type: 'remove' }));
  editor.addEventListener('submit', (event) => {
    event.preventDefault();
    if (current) onCommand({ type: 'rename', id: current.id, name: input.value });
    close();
  });
  cancel.addEventListener('click', close);
  input.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
  return {
    element: bar,
    update(strategies, activeId, labels, nextT) {
      if (nextT) t = nextT;
      currentIndex = Math.max(0, strategies.findIndex((one) => one.id === activeId));
      current = strategies.find((one) => one.id === activeId) || strategies[0];
      const shape = strategies.map((one) => one.id).join('|');
      if (select.dataset.shape !== shape) {
        select.textContent = '';
        for (const strategy of strategies) { const option = html('option', null, select); option.value = strategy.id; }
        select.dataset.shape = shape;
      }
      strategies.forEach((one, index) => { select.options[index].textContent = nameOf(one, index, t); });
      select.value = current.id;
      currentName.textContent = nameOf(current, currentIndex, t);
      label.textContent = t('ui.activeScenario', strategies.length);
      const source = originStateOf(current);
      origin.textContent = t(source === 'default' ? 'ui.example' : source.startsWith('shared') ? 'ui.shared' : 'ui.own');
      origin.dataset.origin = source;
      rename.textContent = t('ui.rename');
      add.textContent = t('ui.copyScenario');
      add.disabled = strategies.length >= MAX_STRATEGIES;
      remove.textContent = t('ui.removeScenario');
      remove.hidden = strategies.length < 2;
      nameLabel.textContent = t('ui.scenarioName');
      done.textContent = t('ui.done'); cancel.textContent = t('ui.cancel');
      editor.hidden = !renaming;
    },
    focusTab() { select.focus(); },
    focusAfterRemove() { select.focus(); },
    focusName() { open(); },
  };
}

/** Compact scenario switch shown only after the main switch leaves the viewport. */
export function createStrategyJump(options) {
  const { mount, watch, onCommand } = options;
  let t = options.t;
  let count = 0;
  let projects = 0;
  let away = false;
  const bar = html('div', 'strategy-jump', mount);
  const lead = html('div', 'strategy-jump-lead', bar);
  const select = html('select', 'scenario-select pinned-scenario', bar);
  bar.hidden = true;
  select.addEventListener('change', () => onCommand({ type: 'select', id: select.value }));
  function settle() { bar.hidden = !away || (count < 2 && projects < 2); select.hidden = count < 2; }
  if (typeof window.IntersectionObserver === 'function') {
    const observer = new window.IntersectionObserver(([record]) => { away = !record.isIntersecting; settle(); });
    observer.observe(watch);
  } else {
    const check = () => { away = watch.getBoundingClientRect().bottom <= 0; settle(); };
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check); check();
  }
  return {
    element: bar, lead,
    setProjects(next) { projects = next; settle(); },
    update(strategies, activeId, labels, nextT) {
      if (nextT) t = nextT;
      count = strategies.length;
      const shape = strategies.map((one) => one.id).join('|');
      if (select.dataset.shape !== shape) {
        select.textContent = '';
        for (const strategy of strategies) { const option = html('option', null, select); option.value = strategy.id; }
        select.dataset.shape = shape;
      }
      strategies.forEach((one, index) => { select.options[index].textContent = nameOf(one, index, t); });
      select.value = activeId;
      select.setAttribute('aria-label', t('ui.activeScenario', count));
      settle();
    },
  };
}
