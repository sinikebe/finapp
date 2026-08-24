/**
 * dom.js — the two element builders every view module uses.
 *
 * Small on purpose: these exist so views build DOM with real nodes and
 * `textContent`, never by concatenating HTML strings around values.
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
