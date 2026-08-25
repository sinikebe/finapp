/**
 * sankey.js — where the money goes, drawn as flow.
 *
 * One card, three columns: what came in, a pool, and what it went to. The pool
 * is not decoration. Money is fungible, and nothing in the model says which
 * salary paid which bill, so drawing income straight to expenses would invent
 * an allocation nobody entered. Everything arrives, mixes, and leaves.
 *
 * **Only a conserving slice can be drawn.** A flow diagram claims that what
 * enters a node leaves it, so the only honest cut of this model is
 * `income → expenses + net`. Investment growth, asset appreciation and drawn
 * loan principal all enter `worth` without a source, and a ribbon for them would
 * be a claim the arithmetic does not support — those live on the cards above.
 *
 * Colour carries direction and nothing else: in, out, kept. At a node face any
 * two ribbons can end up adjacent, so this is an all-pairs form, and three hues
 * is what an all-pairs form can seat. A hue per field would need dozens.
 */

import { html, svgEl } from './dom.js';

const HEIGHT = 340;
const PAD = 10;
const NODE_WIDTH = 11;
/** Between stacked nodes: painted in the surface, so ribbons never fuse. */
const NODE_GAP = 7;
/**
 * The thinnest a flow may be drawn. A rent of 40 beside a salary of 500,000 is
 * a hundredth of a pixel — arithmetically honest and visually absent. Every
 * flow that exists gets a sliver, and the table carries the exact figures.
 */
const MIN_FLOW = 2.5;
/** Below this a node has no room for a label; the table has it instead. */
const LABEL_FLOOR = 11;
const LABEL_PAD = 9;

/**
 * Stack a column of values into boxes, giving the smallest a visible sliver.
 *
 * `budget` is the height the column's boxes must add up to, and it is the same
 * number for both columns however many nodes each holds. That is not tidiness:
 * the same money passes through the pool, so the pool's two faces have to be
 * the same height, and they only are if both columns are drawn to one scale.
 * Subtracting each column's own gaps instead leaves a node where more flows out
 * than in.
 */
function stack(values, top, budget, total, allowance) {
  if (!values.length || total <= 0) return [];
  // The floor allowance is the SAME number for both columns, not each column's
  // own count times the floor. Otherwise the two sides get different
  // pixels-per-unit and the same amount is drawn wider on the sparser side —
  // in a diagram whose entire claim is that width is the value.
  const floors = Math.min(budget, allowance);
  const scaled = Math.max(0, budget - floors);
  const each = floors / values.length;

  let y = top;
  return values.map((value) => {
    const height = each + (value / total) * scaled;
    const box = { y, height };
    y += height + NODE_GAP;
    return box;
  });
}

/** A ribbon: out along the top, down the far face, back along the bottom. */
function ribbonPath(x0, y0, h0, x1, y1, h1) {
  const bend = (x0 + x1) / 2;
  return `M${x0},${y0}`
    + `C${bend},${y0} ${bend},${y1} ${x1},${y1}`
    + `L${x1},${y1 + h1}`
    + `C${bend},${y1 + h1} ${bend},${y0 + h0} ${x0},${y0 + h0}`
    + 'Z';
}

const TONE_VAR = {
  income: '--series-income',
  expense: '--series-expenses',
  net: '--series-net',
};

/**
 * @param {object} options
 * @param {HTMLElement} options.mount
 * @param {string} options.id
 * @param {object} options.labels
 * @param {(value: number) => string} options.formatValue
 */
export function createSankey({ mount, id, title, description, labels, formatValue }) {
  const figure = html('figure', 'chart-card sankey-card', mount);

  const caption = html('figcaption', 'chart-head', figure);
  const heading = html('h3', 'chart-title', caption);
  heading.textContent = title;
  const sub = html('p', 'chart-desc', caption);
  sub.textContent = description;

  // Three hues, so identity never rides on colour alone: the legend names them
  // and every node is written out beside its ribbon.
  const legend = html('ul', 'chart-legend', figure);
  const legendItems = ['income', 'expense', 'net'].map((tone) => {
    const item = html('li', 'legend-item', legend);
    item.style.setProperty('--series', `var(${TONE_VAR[tone]})`);
    html('span', 'legend-key', item);
    const text = html('span', null, item);
    return { tone, text, element: item };
  });

  const plot = html('div', 'chart-plot sankey-plot', figure);
  const svg = svgEl('svg', {
    class: 'sankey-svg', role: 'img', preserveAspectRatio: 'xMidYMid meet',
  }, plot);

  const ribbonLayer = svgEl('g', { class: 'sankey-ribbons' }, svg);
  const nodeLayer = svgEl('g', { class: 'sankey-nodes' }, svg);
  const labelLayer = svgEl('g', { class: 'sankey-labels' }, svg);

  const tooltip = html('div', 'chart-tip', plot);
  tooltip.hidden = true;
  tooltip.setAttribute('aria-hidden', 'true');
  const tipLabel = html('span', 'chart-tip-label', tooltip);
  const tipValue = html('strong', 'chart-tip-value', tooltip);

  const empty = html('p', 'chart-empty', plot);
  empty.hidden = true;

  const tableId = `${id}-table`;
  const toggle = html('button', 'table-toggle', figure);
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', tableId);
  toggle.textContent = labels.showTable;

  const tableWrap = html('div', 'table-wrap', figure);
  tableWrap.id = tableId;
  tableWrap.hidden = true;
  const table = html('table', 'data-table', tableWrap);
  const tableCaption = html('caption', null, table);
  tableCaption.textContent = labels.tableCaption;
  const thead = html('thead', null, table);
  const headRow = html('tr', null, thead);
  const nameTh = html('th', null, headRow);
  nameTh.scope = 'col';
  const flowTh = html('th', 'num', headRow);
  flowTh.scope = 'col';
  const shareTh = html('th', 'num', headRow);
  shareTh.scope = 'col';
  const tbody = html('tbody', null, table);

  let state = {
    sources: [], sinks: [], rows: [], sourceCount: 0,
    total: 0, isEmpty: true, emptyMessage: '',
  };
  let tableRendered = false;
  let frame = 0;

  /* Layers are created once and mutated, never rebuilt: a node replaced under
     the pointer loses the hover it was in the middle of. */
  const ribbons = [];
  function ensureRibbons(count) {
    while (ribbons.length < count) {
      const path = svgEl('path', { class: 'sankey-ribbon' }, ribbonLayer);
      ribbons.push({ path, entry: null });
    }
    while (ribbons.length > count) ribbons.pop().path.remove();
  }

  const nodes = [];
  function ensureNodes(count) {
    while (nodes.length < count) {
      const rect = svgEl('rect', { class: 'sankey-node', rx: '2' }, nodeLayer);
      const text = svgEl('text', { class: 'sankey-label' }, labelLayer);
      const name = svgEl('tspan', {}, text);
      const value = svgEl('tspan', { class: 'sankey-amount' }, text);
      nodes.push({ rect, text, name, value });
    }
    while (nodes.length > count) {
      const node = nodes.pop();
      node.rect.remove();
      node.text.remove();
    }
  }

  function width() {
    return Math.max(280, Math.round(plot.clientWidth || mount.clientWidth || 320));
  }

  function showTip(entry, event) {
    tipLabel.textContent = entry.label;
    // The share travels with the entry rather than being recomputed here: a
    // pooled column would otherwise give the tooltip a different denominator
    // from the table, and the same field two different percentages.
    tipValue.textContent = labels.tipValue(formatValue(entry.value), entry.share || 0);
    tooltip.hidden = false;
    const box = plot.getBoundingClientRect();
    const x = event.clientX - box.left;
    tooltip.style.left = `${Math.min(Math.max(x, 60), box.width - 60)}px`;
    tooltip.style.top = `${Math.max(0, event.clientY - box.top - 44)}px`;
  }

  function hideTip() {
    tooltip.hidden = true;
  }

  svg.addEventListener('pointerleave', (event) => {
    // A touch tap ends with a pointerleave; clearing there would blank the
    // reading the tap just asked for — the same rule the line chart follows.
    if (event.pointerType === 'touch') return;
    hideTip();
  });

  function draw() {
    const w = width();
    svg.setAttribute('viewBox', `0 0 ${w} ${HEIGHT}`);
    svg.style.height = `${HEIGHT}px`;

    const { sources, sinks, total } = state;
    const drawable = !state.isEmpty && total > 0 && sources.length > 0 && sinks.length > 0;
    empty.hidden = drawable;
    if (!drawable) {
      empty.textContent = state.emptyMessage;
      ensureRibbons(0);
      ensureNodes(0);
      return;
    }

    // Gutters hold the written names, so a ribbon never has text on top of it.
    // Capped as a *fraction* rather than a floor: at 96px each on a 350px phone
    // the two gutters took more than half the card and left the ribbons almost
    // vertical, which is a flow diagram that no longer shows flow. Names give
    // way instead — they truncate, and the table has them whole.
    const gutter = Math.min(190, Math.max(58, Math.round(w * 0.22)));
    const leftX = gutter;
    const rightX = w - gutter - NODE_WIDTH;
    const poolX = Math.round(w / 2 - NODE_WIDTH / 2);
    const span = HEIGHT - PAD * 2;

    // One budget for both columns, sized by whichever needs the most gaps, so
    // the two sides of the pool measure the same.
    const leftGaps = NODE_GAP * (sources.length - 1);
    const rightGaps = NODE_GAP * (sinks.length - 1);
    const budget = Math.max(0, span - Math.max(leftGaps, rightGaps));
    const centred = (gaps) => PAD + (span - (budget + gaps)) / 2;

    const allowance = MIN_FLOW * Math.max(sources.length, sinks.length);
    const leftBoxes = stack(sources.map((n) => n.value), centred(leftGaps), budget, total, allowance);
    const rightBoxes = stack(sinks.map((n) => n.value), centred(rightGaps), budget, total, allowance);

    // The pool's faces are continuous — it is one node, so nothing is stacked
    // with gaps there; each face is partitioned in its own column's order.
    const poolTop = PAD + (span - budget) / 2;
    const faces = (boxes) => {
      let y = poolTop;
      return boxes.map((box) => {
        const slice = { y, height: box.height };
        y += box.height;
        return slice;
      });
    };
    const leftFaces = faces(leftBoxes);
    const rightFaces = faces(rightBoxes);
    const poolBottom = poolTop + budget;

    ensureRibbons(sources.length + sinks.length);
    ensureNodes(sources.length + sinks.length + 1);

    let r = 0;
    sources.forEach((entry, index) => {
      const box = leftBoxes[index];
      const face = leftFaces[index];
      const ribbon = ribbons[r];
      r += 1;
      ribbon.entry = entry;
      ribbon.path.setAttribute('d', ribbonPath(
        leftX + NODE_WIDTH, box.y, box.height, poolX, face.y, face.height,
      ));
      ribbon.path.style.fill = `var(${TONE_VAR[entry.tone]})`;
    });
    sinks.forEach((entry, index) => {
      const box = rightBoxes[index];
      const face = rightFaces[index];
      const ribbon = ribbons[r];
      r += 1;
      ribbon.entry = entry;
      ribbon.path.setAttribute('d', ribbonPath(
        poolX + NODE_WIDTH, face.y, face.height, rightX, box.y, box.height,
      ));
      ribbon.path.style.fill = `var(${TONE_VAR[entry.tone]})`;
    });

    // A name may be sixty characters; a gutter may be ninety-six pixels. The
    // name gives way, never the amount — the number is what the ribbon is for,
    // and the table carries the name in full either way.
    const fitLabel = (node, label, room) => {
      node.name.textContent = label;
      let measured = 0;
      try {
        measured = node.text.getComputedTextLength();
      } catch {
        return; // not laid out yet; the next draw will size it
      }
      if (!measured || measured <= room) return;

      // Bisection rather than a character at a time: every measurement forces a
      // synchronous layout, and this runs on the redraw behind every keystroke.
      // Sixty characters cost six reflows here instead of sixty.
      let low = 0;
      let high = label.length;
      let best = '';
      while (low <= high) {
        const mid = (low + high) >> 1;
        node.name.textContent = `${label.slice(0, mid).trimEnd()}\u2026`;
        if (node.text.getComputedTextLength() <= room) {
          best = node.name.textContent;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      node.name.textContent = best || '\u2026';
    };

    let n = 0;
    const place = (entry, box, x, anchor) => {
      const node = nodes[n];
      n += 1;
      node.rect.setAttribute('x', x);
      node.rect.setAttribute('y', box.y.toFixed(2));
      node.rect.setAttribute('width', NODE_WIDTH);
      node.rect.setAttribute('height', Math.max(MIN_FLOW, box.height).toFixed(2));
      node.rect.style.fill = `var(${TONE_VAR[entry.tone]})`;

      // Selective labels: a sliver has no room, and the table carries it.
      const roomy = box.height >= LABEL_FLOOR;
      node.text.style.display = roomy ? '' : 'none';
      if (!roomy) return;
      node.text.setAttribute('text-anchor', anchor);
      node.text.setAttribute('x', anchor === 'end' ? x - LABEL_PAD : x + NODE_WIDTH + LABEL_PAD);
      node.text.setAttribute('y', (box.y + box.height / 2 + 4).toFixed(2));
      node.value.textContent = ` ${formatValue(entry.value)}`;
      fitLabel(node, entry.label, gutter - LABEL_PAD - 4);
    };

    sources.forEach((entry, index) => place(entry, leftBoxes[index], leftX, 'end'));
    sinks.forEach((entry, index) => place(entry, rightBoxes[index], rightX, 'start'));

    const pool = nodes[n];
    pool.rect.setAttribute('x', poolX);
    pool.rect.setAttribute('y', poolTop.toFixed(2));
    pool.rect.setAttribute('width', NODE_WIDTH);
    pool.rect.setAttribute('height', Math.max(MIN_FLOW, poolBottom - poolTop).toFixed(2));
    pool.rect.style.fill = 'var(--text-muted)';
    pool.text.setAttribute('text-anchor', 'middle');
    pool.text.setAttribute('x', poolX + NODE_WIDTH / 2);
    pool.text.setAttribute('y', Math.max(12, poolTop - 8).toFixed(2));
    pool.text.style.display = '';
    pool.name.textContent = labels.pool;
    pool.value.textContent = ` ${formatValue(total)}`;

    svg.setAttribute('aria-label', labels.aria(formatValue(total), sources.length, sinks.length));
  }

  // On the svg rather than the ribbon group: a <g> is not a hit target, so a
  // listener there only ever hears its own paths, and the `else` could never
  // run — a pointer moving off a ribbon into the gutter left a reading up with
  // nothing under it.
  const track = (event) => {
    const found = ribbons.find((ribbon) => ribbon.path === event.target);
    if (found && found.entry) showTip(found.entry, event);
    else hideTip();
  };
  svg.addEventListener('pointermove', track);
  // A still tap fires no pointermove, so touch needs its own way in — the same
  // pair the line chart listens for.
  svg.addEventListener('pointerdown', track);
  // A scroll that merely began on a ribbon ends here, not in pointerleave.
  svg.addEventListener('pointercancel', hideTip);

  function renderTable() {
    // Rebuilt wholesale, so the reader's place in a long list has to be put
    // back: without this a keystroke in the form scrolls the table to the top.
    const scrolled = tableWrap.scrollTop;
    tbody.textContent = '';
    const fragment = document.createDocumentFragment();
    // Every field, including the small ones the drawing pooled: the table is
    // where nothing is allowed to be lost.
    const listed = state.rows.length ? state.rows : [...state.sources, ...state.sinks];
    listed.forEach((entry) => {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      const key = document.createElement('span');
      key.className = 'row-key';
      key.style.setProperty('--series', `var(${TONE_VAR[entry.tone]})`);
      th.appendChild(key);
      // Direction is the one thing the drawing says in colour alone, and the
      // table is where nothing is allowed to be lost — so it is said in words
      // too, in the words the legend already uses. The leftover node names
      // itself ("Kept", "Made up from savings"), so it needs no prefix.
      if (entry.tone !== 'net') {
        const tone = document.createElement('span');
        tone.className = 'sr-only';
        tone.textContent = labels.rowTone(labels.tone(entry.tone));
        th.appendChild(tone);
      }
      th.appendChild(document.createTextNode(entry.label));
      row.appendChild(th);

      const amount = document.createElement('td');
      amount.className = 'num';
      amount.textContent = formatValue(entry.value);
      row.appendChild(amount);

      const share = document.createElement('td');
      share.className = 'num';
      share.textContent = state.total ? labels.share(entry.share || 0) : '';
      row.appendChild(share);
      fragment.appendChild(row);
    });
    tbody.appendChild(fragment);
    tableWrap.scrollTop = scrolled;
    tableRendered = true;
  }

  toggle.addEventListener('click', () => {
    const open = tableWrap.hidden === false;
    if (open) {
      tableWrap.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = labels.showTable;
      return;
    }
    if (!tableRendered) renderTable();
    tableWrap.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.textContent = labels.hideTable;
  });

  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(draw);
    })
    : null;
  if (observer) observer.observe(plot);
  else window.addEventListener('resize', draw);

  return {
    update(next) {
      // A redraw that moves a ribbon invalidates any reading taken from it —
      // but a redraw that changes nothing must not, or a tap that merely blurs
      // an input would clear the reading that same tap just asked for. Same
      // flows in the same order means every ribbon lands where it already is.
      const flows = (list) => list.map((entry) => `${entry.id}:${entry.value}`).join('|');
      const before = `${flows(state.sources)}/${flows(state.sinks)}`;
      state = {
        sources: next.sources || [],
        sinks: next.sinks || [],
        rows: next.rows || [],
        sourceCount: next.sourceCount || 0,
        total: next.total || 0,
        isEmpty: Boolean(next.isEmpty),
        emptyMessage: next.emptyMessage || '',
      };
      // The legend names what is drawn and nothing else. The leftover node is
      // conditional — absent when income and outgoings match exactly — and it
      // changes sides and meaning when they do not, so a fixed third caption
      // would name a colour that is not on the card, or call money arriving
      // from savings "left over".
      const drawn = [...state.sources, ...state.sinks];
      const leftover = drawn.find((entry) => entry.tone === 'net');
      legendItems.forEach((item) => {
        const present = drawn.some((entry) => entry.tone === item.tone);
        item.element.hidden = !present;
        item.text.textContent = item.tone === 'net' && leftover
          ? leftover.label
          : labels.tone(item.tone);
      });
      nameTh.textContent = labels.nameColumn;
      flowTh.textContent = labels.flowColumn;
      shareTh.textContent = labels.shareColumn;
      if (`${flows(state.sources)}/${flows(state.sinks)}` !== before) hideTip();
      if (tableRendered) renderTable();
      else tbody.textContent = '';
      draw();
    },

    // Touch holds a reading through the tap's own pointerleave; app.js clears it
    // when a tap lands anywhere else. Without both halves it would never clear.
    hideTip,

    setHeading(next) {
      heading.textContent = next.title;
      sub.textContent = next.description;
      tableCaption.textContent = next.tableCaption;
      toggle.textContent = tableWrap.hidden ? labels.showTable : labels.hideTable;
    },

    destroy() {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', draw);
      window.cancelAnimationFrame(frame);
      figure.remove();
    },
  };
}
