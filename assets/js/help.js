/** Contextual reading help. Existing text nodes stay mounted and translated. */
import { html, svgEl } from './dom.js';

/** Keep a help panel inside the visible viewport, including narrow/short screens. */
export function helpPlacement(anchor, viewport, height) {
  const margin = 12; const gap = 8;
  const x = viewport.x || 0; const y = viewport.y || 0;
  const width = Math.min(360, Math.max(0, viewport.width - 2 * margin));
  const maxHeight = Math.max(0, viewport.height - 2 * margin);
  const shownHeight = Math.min(height, maxHeight);
  const left = Math.max(x + margin, Math.min(anchor.left, x + viewport.width - margin - width));
  const below = anchor.bottom + gap;
  const preferred = below + shownHeight <= y + viewport.height - margin ? below : anchor.top - gap - shownHeight;
  const top = Math.max(y + margin, Math.min(preferred, y + viewport.height - margin - shownHeight));
  return { left, top, width, maxHeight };
}

export function createHelpTips({ root = document, translator }) {
  const host = root.defaultView;
  const t = (...args) => translator()(...args);
  const records = []; let active = null;
  const viewport = () => ({ x: host.visualViewport?.offsetLeft || 0, y: host.visualViewport?.offsetTop || 0,
    width: host.visualViewport?.width || root.documentElement.clientWidth,
    height: host.visualViewport?.height || root.documentElement.clientHeight });

  function close(restoreFocus = false) {
    if (!active) return;
    const record = active; active = null;
    record.tip.open = false; record.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && record.trigger.getClientRects().length) record.trigger.focus({ preventScroll: true });
  }

  function position() {
    if (!active) return;
    const { trigger, panel } = active;
    if (!trigger.getClientRects().length) { close(); return; }
    const bounds = viewport(); const anchor = trigger.getBoundingClientRect();
    if (anchor.bottom < bounds.y || anchor.top > bounds.y + bounds.height) { close(); return; }
    const size = helpPlacement(anchor, bounds, 0);
    panel.style.width = `${size.width}px`; panel.style.maxHeight = `${size.maxHeight}px`;
    const placed = helpPlacement(anchor, bounds, panel.getBoundingClientRect().height);
    panel.style.left = `${placed.left}px`; panel.style.top = `${placed.top}px`;
  }

  function update() {
    for (const record of records) {
      const label = t('help.label', t(record.key));
      record.trigger.setAttribute('aria-label', label);
      record.close.textContent = t('ui.close');
      record.close.setAttribute('aria-label', t('help.close'));
      record.tip.hidden = !record.sources.some((node) => !node.hidden && node.textContent.trim());
      if (record.heading) record.heading.hidden = record.headingTitle.hidden && record.tip.hidden;
      if (active === record && record.tip.hidden) close();
    }
    position();
  }

  for (const source of root.querySelectorAll('[data-help]')) {
    const existing = source.tagName === 'DETAILS';
    const tip = existing ? source : html('details', 'help-tip');
    if (!existing) source.before(tip);
    tip.classList.add('help-tip'); tip.open = false;
    const trigger = existing ? source.querySelector('summary') : html('summary', null, tip);
    const key = source.dataset.help;
    trigger.removeAttribute('data-i18n'); trigger.replaceChildren();
    const mark = svgEl('svg', { class: 'ui-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, trigger);
    svgEl('circle', { cx: 12, cy: 12, r: 9 }, mark);
    svgEl('path', { d: 'M12 11v6M12 7h.01' }, mark);
    const sources = existing ? [...source.children].filter((node) => node !== trigger) : [source];
    const panel = html('div', 'help-content', tip);
    panel.id = `help-panel-${records.length + 1}`;
    trigger.id = `${panel.id}-trigger`;
    trigger.setAttribute('aria-controls', panel.id); trigger.setAttribute('aria-expanded', 'false');
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-labelledby', trigger.id);
    panel.append(...sources);
    const dismiss = html('button', 'ghost-button help-close', panel); dismiss.type = 'button';
    panel.prepend(dismiss);
    dismiss.addEventListener('click', () => close(true));
    const record = { tip, trigger, panel, close: dismiss, sources, key };
    const before = source.dataset.helpBefore && root.querySelector(source.dataset.helpBefore);
    const container = source.dataset.helpHost && root.querySelector(source.dataset.helpHost);
    const title = source.dataset.helpAnchor && root.querySelector(source.dataset.helpAnchor);
    if (before) before.before(tip);
    else if (container) container.appendChild(tip);
    else if (title) {
      let heading = title.parentElement;
      if (!heading.classList.contains('help-heading')) { heading = html('div', 'help-heading'); title.before(heading); heading.appendChild(title); }
      heading.appendChild(tip); record.heading = heading; record.headingTitle = title;
    }
    const syncOpen = () => {
      if (tip.open) { if (active !== record) close(); active = record; trigger.setAttribute('aria-expanded', 'true'); position(); }
      else { trigger.setAttribute('aria-expanded', 'false'); if (active === record) active = null; }
    };
    // Native toggle events are queued. Update the active help immediately so
    // a fast Escape closes this panel before a containing menu or dialog.
    trigger.addEventListener('click', (event) => { event.preventDefault(); tip.open = !tip.open; syncOpen(); });
    tip.addEventListener('toggle', syncOpen);
    records.push(record);
  }

  // Observe only source text and visibility: result updates never recreate a tip
  // or reset keyboard focus, and changing a language cannot erase its icon.
  const observer = new host.MutationObserver(update);
  for (const record of records) for (const source of record.sources) observer.observe(source,
    { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  observer.observe(root.documentElement, { attributes: true, attributeFilter: ['lang'] });
  root.addEventListener('click', (event) => { if (active && !active.tip.contains(event.target)) close(); });
  root.addEventListener('focusin', (event) => { if (active && !active.tip.contains(event.target)) close(); });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active) { event.preventDefault(); event.stopPropagation(); close(true); }
  }, true);
  root.addEventListener('toggle', (event) => {
    if (active && event.target !== active.tip && event.target.tagName === 'DETAILS') {
      if ((!event.target.open && event.target.contains(active.tip)) || (event.target.open && !event.target.contains(active.tip))) close();
    }
  }, true);
  root.addEventListener('close', (event) => { if (active && event.target.contains(active.tip)) close(); }, true);
  root.addEventListener('scroll', (event) => { if (active && !active.panel.contains(event.target)) position(); }, true);
  host.addEventListener('resize', position);
  host.visualViewport?.addEventListener('resize', position);
  host.visualViewport?.addEventListener('scroll', position);
  update();
  return { update, close };
}
