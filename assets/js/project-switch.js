/**
 * project-switch.js — saying which question you are asking, and changing it.
 *
 * Two switchers on one screen is the trap this feature walks into, and the way
 * out is that these two are not the same *kind* of control.
 *
 * A strategy is switched constantly while you are comparing, so it is a row of
 * pills you can hit without aiming: peers, one of them selected, the selected
 * one editable in place. A project is switched a handful of times in a session,
 * and switching it replaces every plan, every target and the horizon at once.
 * So it is one button that carries the current name, and pressing it opens a
 * sheet. Different gesture, different weight, different plane — the row of
 * pills is on the page, the sheet is over it.
 *
 * The button is deliberately *not* a pill and never coloured. The palette has
 * four strategy colours and every one of them is spoken for by a curve in the
 * comparison; a fifth mark that looked like a legend swatch would be read as
 * one. What it has instead is a chevron, the weight of a heading, and — where
 * it stands beside the pills, in the pinned bar — a rule between them.
 */

import { html } from './dom.js';
import { actionIcon } from './field-list.js';
import { nameOf, MAX_NAME_LENGTH, MAX_PROJECTS } from './projects.js';
import { TEMPLATES } from './templates.js';

/**
 * The mark that says a list opens here — and deliberately **not** the chevron.
 *
 * The button that folds the form sits on the same line, 40 pixels away, and it
 * is a stroked chevron: `M6 10.5 12 16l6-5.5`. Drawing the same glyph beside it
 * would put two identical marks on one line meaning two entirely different
 * things, which was the first thing the prototype got wrong and the screenshot
 * showed. So this is a small solid caret — filled where the other is stroked,
 * eight pixels where the other is twenty-four, and hard against the name rather
 * than out at the edge. The two do not read as a pair.
 */
function caret(parent) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'project-caret');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M1 3.4h8L5 8z');
  svg.appendChild(path);
  parent.appendChild(svg);
  return svg;
}

/**
 * The button that names the project and opens the sheet.
 *
 * @param {{mount: HTMLElement, className: string, onOpen: () => void}} options
 */
export function createProjectSwitch(options) {
  const { mount, onOpen } = options;
  const button = html('button', options.className, mount);
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', 'projects');
  const label = html('span', 'project-switch-name', button);
  caret(button);
  button.addEventListener('click', onOpen);

  return {
    element: button,
    update(projects, openId, t, labels) {
      const index = projects.findIndex((project) => project.id === openId);
      const shown = nameOf(projects[index] || projects[0], Math.max(index, 0), projects.length, t);
      label.textContent = shown;
      button.setAttribute('aria-label', labels.switchAria(shown, projects.length));
      // One project is not a set to choose from, but the button is still how
      // you make the second — so it stays, and says so instead of counting.
      button.dataset.only = projects.length <= 1 ? 'true' : 'false';
    },
  };
}

/**
 * The sheet: every project, which one is open, and the two moves that change
 * the set. Renaming lives here and only here, exactly as renaming a strategy
 * lives in the bar and not in its pinned copy — one name, one box.
 *
 * @param {{
 *   mount: HTMLElement, labels: object,
 *   t: (key: string, ...params: unknown[]) => string,
 *   onCommand: (command: {type: string, id?: string, name?: string}) => void
 * }} options
 */
export function createProjectList(options) {
  const { mount, onCommand } = options;
  let labels = options.labels;
  let t = options.t;

  const list = html('ul', 'project-list', mount);
  list.setAttribute('role', 'list');
  const add = html('button', 'add-strategy project-add', mount);
  add.type = 'button';
  add.addEventListener('click', () => onCommand({ type: 'add' }));

  /*
   * The templates, under the blank one rather than instead of it.
   *
   * "Start another project" keeps doing exactly what it did — one press, no
   * decision, an empty form — because a reader who knows what they are asking
   * should not have to decline a menu first. The templates are the second line,
   * for the reader who does not yet know which questions the subject *has*.
   *
   * Each is a button carrying the template's name, with its note underneath in
   * hint type. The note is not a tooltip: it is where the figures are said to
   * be examples, and that has to be legible before the button is pressed rather
   * than after.
   */
  const shelf = html('div', 'template-shelf', mount);
  const fromLine = html('p', 'hint template-from', shelf);
  const buttons = TEMPLATES.map((template) => {
    const row = html('div', 'template-row', shelf);
    const button = html('button', 'ghost-button template-start', row);
    button.type = 'button';
    button.addEventListener('click', () => onCommand({ type: 'template', template: template.id }));
    const note = html('p', 'hint template-note', row);
    return { template, button, note };
  });

  const entries = new Map();

  function createEntry(id) {
    const row = html('li', 'project-row');

    const open = html('button', 'project-open', row);
    open.type = 'button';
    open.addEventListener('click', () => onCommand({ type: 'open', id }));

    const name = html('input', 'project-name', row);
    name.type = 'text';
    name.maxLength = MAX_NAME_LENGTH;
    name.autocomplete = 'off';
    const entry = { row, open, name, count: null, remove: null, shown: '' };
    name.addEventListener('input', () => onCommand({ type: 'rename', id, name: name.value }));
    name.addEventListener('blur', () => {
      if (name.value === entry.shown) return;
      onCommand({ type: 'settle', id, name: name.value });
    });

    entry.count = html('span', 'project-count', row);

    entry.remove = html('button', 'icon-button project-remove', row);
    entry.remove.type = 'button';
    actionIcon('remove', entry.remove);
    entry.remove.addEventListener('click', () => onCommand({ type: 'remove', id }));

    entries.set(id, entry);
    return entry;
  }

  return {
    element: list,

    update(projects, openId, nextLabels, nextT) {
      if (nextLabels) labels = nextLabels;
      if (nextT) t = nextT;
      add.textContent = labels.add;
      add.disabled = projects.length >= MAX_PROJECTS;
      // The whole shelf goes when there is no room, rather than sitting there
      // greyed: at six projects it is not a choice the reader can make, and a
      // row of disabled buttons with their notes under them is a paragraph of
      // copy about something that cannot happen.
      shelf.hidden = projects.length >= MAX_PROJECTS;
      fromLine.textContent = labels.templateFrom;
      for (const entry of buttons) {
        const name = t(entry.template.nameKey);
        entry.button.textContent = name;
        entry.button.setAttribute('aria-label', labels.templateAria(name));
        entry.note.textContent = t(entry.template.noteKey);
      }

      let cursor = list.firstChild;
      const present = new Set();
      projects.forEach((project, index) => {
        present.add(project.id);
        const entry = entries.get(project.id) || createEntry(project.id);
        if (entry.row !== cursor) list.insertBefore(entry.row, cursor);
        else cursor = cursor.nextSibling;

        const shown = nameOf(project, index, projects.length, t);
        const open = project.id === openId;
        // The open one *is* its name box, the way the active strategy tab is:
        // a name lives in one place on screen rather than in a row and a field
        // that have to agree.
        entry.open.hidden = open;
        entry.name.hidden = !open;
        entry.open.textContent = shown;
        entry.open.setAttribute('aria-label', labels.openNamed(shown));
        entry.name.setAttribute('aria-label', labels.nameAria);
        entry.name.placeholder = labels.namePlaceholder;
        if (entry.name.value !== shown && document.activeElement !== entry.name) {
          entry.name.value = shown;
        }
        entry.shown = shown;
        entry.row.dataset.open = open ? 'true' : 'false';
        if (open) entry.row.setAttribute('aria-current', 'true');
        else entry.row.removeAttribute('aria-current');

        // What is in it, in the two numbers that decide whether you meant this
        // one: how many plans, and how far they run.
        entry.count.textContent = labels.count(project.plan.strategies.length, project.plan.months);
        entry.remove.setAttribute('aria-label', labels.removeNamed(shown));
        entry.remove.disabled = projects.length <= 1;
      });

      for (const [id, entry] of entries) {
        if (present.has(id)) continue;
        entry.row.remove();
        entries.delete(id);
      }
    },

    /** Put the caret in a project's name, ready to be typed over. */
    focusName(id) {
      const entry = entries.get(id);
      if (entry && !entry.name.hidden) entry.name.focus();
      else add.focus();
      if (entry && !entry.name.hidden) entry.name.select();
    },

    focusAfterRemove() {
      add.focus();
    },
  };
}
