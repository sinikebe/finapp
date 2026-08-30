/**
 * dom.js — the handful of DOM helpers every view module uses.
 *
 * Small on purpose: the two builders exist so views build DOM with real nodes
 * and `textContent`, never by concatenating HTML strings around values, and the
 * two updaters exist because a view that reconciles rather than re-renders has
 * to write into controls a reader may be looking at. They started out private
 * to the field list, which was the only view reconciling anything; they are here
 * because that is no longer true, and because a module wanting them should not
 * have to import from a view to get them.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** An HTML element, optionally classed and appended. */
export function html(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

/** An SVG element with attributes, optionally appended. Named `svgEl` so a view
 *  can keep a local `svg` for the element it is drawing into. */
export function svgEl(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    node.setAttribute(key, String(value));
  }
  if (parent) parent.appendChild(node);
  return node;
}

/** Show or hide a control and the label that names it. */
export function setVisible(control, label, visible) {
  control.hidden = !visible;
  label.hidden = !visible;
}

/** Write a value into a control the reader is not currently editing. */
export function syncValue(control, value) {
  if (control.value !== value && document.activeElement !== control) control.value = value;
}
