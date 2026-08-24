/**
 * chart.js — a small-multiple line chart, drawn as SVG with no dependencies.
 *
 * One series per chart, one shared y-scale across charts (passed in as `domain`),
 * so the three cards can be read against each other. Every value the tooltip
 * shows is also reachable without hovering: the endpoint is direct-labelled and
 * each card carries a table view.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const PLOT_HEIGHT = 180;
const TOP_PAD = 14;
const X_AXIS_BAND = 26;
const LEFT_PAD = 46;
const MIN_RIGHT_PAD = 44;
const CHAR_WIDTH = 7.4; // 12px semibold system sans, close enough to reserve space
const MARKER_RADIUS = 4.5;
const X_TICK_STEPS = [1, 2, 3, 6, 12, 24, 36, 60, 120, 240];

function el(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    node.setAttribute(key, String(value));
  }
  if (parent) parent.appendChild(node);
  return node;
}

function html(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

/** Round a scale value away from float noise (0.30000000000000004 → 0.3). */
function tidy(value, step) {
  const decimals = Math.max(0, Math.min(10, -Math.floor(Math.log10(Math.abs(step))) + 2));
  return Number(value.toFixed(decimals));
}

/** A y-domain snapped outward to human tick values (0 / 20K / 40K …). */
export function niceScale(min, max, target = 4) {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (hi - lo === 0) hi = lo + 1;
  const rawStep = (hi - lo) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const nice = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  const step = nice * magnitude;
  const niceMin = Math.floor(lo / step) * step;
  const niceMax = Math.ceil(hi / step) * step;
  const ticks = [];
  const count = Math.round((niceMax - niceMin) / step);
  for (let i = 0; i <= count; i += 1) ticks.push(tidy(niceMin + i * step, step));
  return { min: tidy(niceMin, step), max: tidy(niceMax, step), step, ticks };
}

/** Month-axis step that keeps the label count at six or fewer. */
export function monthTickStep(months) {
  for (const step of X_TICK_STEPS) {
    if (months / step <= 6) return step;
  }
  return Math.ceil(months / 6);
}

/**
 * @param {{
 *   mount: HTMLElement, id: string, title: string, description: string,
 *   seriesLabel: string, colorVar: string,
 *   labels: {showTable: string, hideTable: string, tableCaption: string,
 *            monthColumn: string, ariaLabel: (months: number, endValue: string) => string},
 *   formatValue: (n: number) => string, formatTick: (n: number) => string,
 *   formatMonth: (n: number) => string, onHover?: (index: number|null) => void
 * }} options
 */
export function createLineChart(options) {
  const {
    mount, id, title, description, seriesLabel, colorVar, labels,
    formatValue, formatTick, formatMonth, onHover,
  } = options;

  const figure = html('figure', 'chart-card', mount);
  figure.style.setProperty('--series', `var(${colorVar})`);

  const caption = html('figcaption', 'chart-head', figure);
  const heading = html('h3', 'chart-title', caption);
  heading.textContent = title;
  const sub = html('p', 'chart-desc', caption);
  sub.textContent = description;

  const plot = html('div', 'chart-plot', figure);
  const svg = el('svg', {
    class: 'chart-svg', role: 'img', tabindex: '0',
    preserveAspectRatio: 'xMidYMid meet',
  }, plot);
  plot.appendChild(svg);

  const tooltip = html('div', 'chart-tip', plot);
  tooltip.hidden = true;
  tooltip.setAttribute('aria-hidden', 'true');
  const tipValue = html('strong', 'chart-tip-value', tooltip);
  const tipMeta = html('span', 'chart-tip-meta', tooltip);
  html('span', 'chart-tip-key', tipMeta); // the series line-key, purely visual
  const tipLabel = html('span', 'chart-tip-label', tipMeta);
  tipLabel.textContent = seriesLabel;
  const tipMonth = html('span', 'chart-tip-month', tooltip);

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
  const monthTh = html('th', null, headRow);
  monthTh.scope = 'col';
  monthTh.textContent = labels.monthColumn;
  const valueTh = html('th', 'num', headRow);
  valueTh.scope = 'col';
  valueTh.textContent = seriesLabel;
  const tbody = html('tbody', null, table);

  // Painted once, then mutated in place on every update.
  const gridLayer = el('g', { class: 'layer-grid' }, svg);
  const areaPath = el('path', { class: 'series-area' }, svg);
  const linePath = el('path', { class: 'series-line' }, svg);
  const zeroLine = el('line', { class: 'axis-zero' }, svg);
  const xAxisLine = el('line', { class: 'axis-line' }, svg);
  const xLabels = el('g', { class: 'layer-xlabels' }, svg);
  const crosshair = el('line', { class: 'crosshair' }, svg);
  // Ring + dot: the ring is the 2px surface gap that keeps a marker legible
  // where it crosses the line or the grid.
  const focusRing = el('circle', { class: 'focus-ring', r: MARKER_RADIUS + 2 }, svg);
  const focusDot = el('circle', { class: 'focus-dot', r: MARKER_RADIUS }, svg);
  const endRing = el('circle', { class: 'end-ring', r: MARKER_RADIUS + 2 }, svg);
  const endDot = el('circle', { class: 'end-dot', r: MARKER_RADIUS }, svg);
  const endLabel = el('text', { class: 'end-label', 'text-anchor': 'start', dy: '0.32em' }, svg);

  let state = { points: [], domain: { min: 0, max: 1 }, months: 1, isEmpty: true };
  let geometry = null;
  let activeIndex = null;
  let tableRendered = false;
  let frame = 0;

  function width() {
    return Math.max(240, Math.round(plot.clientWidth || mount.clientWidth || 320));
  }

  function setCrosshairVisible(visible) {
    for (const node of [crosshair, focusRing, focusDot]) {
      node.style.display = visible ? '' : 'none';
    }
    tooltip.hidden = !visible;
  }

  // Nothing is hovered yet, so the crosshair layer starts out of the way.
  setCrosshairVisible(false);

  function render() {
    const { points, domain, months, isEmpty } = state;
    const w = width();
    const scale = niceScale(domain.min, domain.max);
    const endValue = points.length ? points[points.length - 1].value : 0;
    const rightPad = Math.max(
      MIN_RIGHT_PAD,
      Math.ceil(formatValue(endValue).length * CHAR_WIDTH) + 16,
    );
    const plotW = Math.max(40, w - LEFT_PAD - rightPad);
    const height = TOP_PAD + PLOT_HEIGHT + X_AXIS_BAND;

    svg.setAttribute('viewBox', `0 0 ${w} ${height}`);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(height));

    const span = scale.max - scale.min || 1;
    const xOf = (month) => LEFT_PAD + (months ? (month / months) * plotW : 0);
    const yOf = (value) => TOP_PAD + PLOT_HEIGHT - ((value - scale.min) / span) * PLOT_HEIGHT;

    geometry = { xOf, yOf, plotW, plotH: PLOT_HEIGHT, height, scale };

    // --- gridlines + y ticks -------------------------------------------------
    gridLayer.textContent = '';
    for (const tick of scale.ticks) {
      const y = yOf(tick);
      el('line', { class: 'grid-line', x1: LEFT_PAD, x2: LEFT_PAD + plotW, y1: y, y2: y }, gridLayer);
      const label = el('text', {
        class: 'tick-label', x: LEFT_PAD - 8, y, 'text-anchor': 'end', dy: '0.32em',
      }, gridLayer);
      label.textContent = formatTick(tick);
    }

    // --- axes ----------------------------------------------------------------
    const baseY = TOP_PAD + PLOT_HEIGHT;
    xAxisLine.setAttribute('x1', LEFT_PAD);
    xAxisLine.setAttribute('x2', LEFT_PAD + plotW);
    xAxisLine.setAttribute('y1', baseY);
    xAxisLine.setAttribute('y2', baseY);

    const crossesZero = scale.min < 0 && scale.max > 0;
    zeroLine.style.display = crossesZero ? '' : 'none';
    if (crossesZero) {
      const zeroY = yOf(0);
      zeroLine.setAttribute('x1', LEFT_PAD);
      zeroLine.setAttribute('x2', LEFT_PAD + plotW);
      zeroLine.setAttribute('y1', zeroY);
      zeroLine.setAttribute('y2', zeroY);
    }

    xLabels.textContent = '';
    const step = monthTickStep(months);
    for (let month = 0; month <= months; month += step) {
      const label = el('text', {
        class: 'tick-label', x: xOf(month), y: baseY + 16, 'text-anchor': 'middle',
      }, xLabels);
      label.textContent = String(month);
    }

    // --- series --------------------------------------------------------------
    const hasSeries = points.length > 1 && !isEmpty;
    for (const node of [areaPath, linePath, endRing, endDot, endLabel]) {
      node.style.display = hasSeries ? '' : 'none';
    }
    empty.hidden = hasSeries;
    svg.classList.toggle('is-empty', !hasSeries);

    if (hasSeries) {
      const commands = points.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.month).toFixed(2)},${yOf(p.value).toFixed(2)}`);
      linePath.setAttribute('d', commands.join(''));
      const zeroY = yOf(Math.min(Math.max(0, scale.min), scale.max));
      areaPath.setAttribute(
        'd',
        `${commands.join('')}L${xOf(months).toFixed(2)},${zeroY.toFixed(2)}L${xOf(0).toFixed(2)},${zeroY.toFixed(2)}Z`,
      );

      const endX = xOf(months);
      const endY = yOf(endValue);
      for (const node of [endRing, endDot]) {
        node.setAttribute('cx', endX);
        node.setAttribute('cy', endY);
      }
      endLabel.setAttribute('x', endX + 10);
      endLabel.setAttribute('y', Math.min(Math.max(endY, TOP_PAD + 6), baseY - 2));
      endLabel.textContent = formatValue(endValue);
    }

    svg.setAttribute('aria-label', labels.ariaLabel(months, formatValue(endValue)));

    if (activeIndex !== null) drawCrosshair(activeIndex);
  }

  function drawCrosshair(index) {
    if (!geometry || state.isEmpty || !state.points.length) return;
    const point = state.points[Math.min(index, state.points.length - 1)];
    if (!point) return;
    const x = geometry.xOf(point.month);
    const y = geometry.yOf(point.value);
    crosshair.setAttribute('x1', x);
    crosshair.setAttribute('x2', x);
    crosshair.setAttribute('y1', TOP_PAD);
    crosshair.setAttribute('y2', TOP_PAD + PLOT_HEIGHT);
    for (const node of [focusRing, focusDot]) {
      node.setAttribute('cx', x);
      node.setAttribute('cy', y);
    }
    tipValue.textContent = formatValue(point.value);
    tipMonth.textContent = formatMonth(point.month);
    setCrosshairVisible(true);

    // The SVG scales to its container, so map user units back to CSS pixels
    // before placing the tooltip, which lives in the HTML layer above it.
    const plotBox = plot.getBoundingClientRect();
    const svgBox = svg.getBoundingClientRect();
    const drawnWidth = Number(svg.getAttribute('width')) || 1;
    const ratio = svgBox.width ? svgBox.width / drawnWidth : 1;
    const rawLeft = (svgBox.left - plotBox.left) + x * ratio;
    const half = tooltip.offsetWidth / 2;
    const maxLeft = Math.max(half, plotBox.width - half);
    tooltip.style.left = `${Math.min(Math.max(rawLeft, half), maxLeft)}px`;
    tooltip.style.top = `${(svgBox.top - plotBox.top) + y * ratio}px`;
  }

  function indexFromEvent(event) {
    if (!geometry || !state.months) return null;
    const box = svg.getBoundingClientRect();
    if (!box.width) return null;
    const scaleX = Number(svg.getAttribute('width')) / box.width;
    const x = (event.clientX - box.left) * scaleX;
    const ratio = (x - LEFT_PAD) / geometry.plotW;
    const month = Math.round(Math.min(1, Math.max(0, ratio)) * state.months);
    return Math.min(state.points.length - 1, Math.max(0, month));
  }

  function emitHover(index) {
    if (onHover) onHover(index);
    else setActive(index);
  }

  function setActive(index) {
    activeIndex = index;
    if (index === null || state.isEmpty) {
      setCrosshairVisible(false);
      return;
    }
    drawCrosshair(index);
  }

  function renderTable() {
    tbody.textContent = '';
    const fragment = document.createDocumentFragment();
    for (const point of state.points) {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = String(point.month);
      const td = document.createElement('td');
      td.className = 'num';
      td.textContent = formatValue(point.value);
      row.append(th, td);
      fragment.appendChild(row);
    }
    tbody.appendChild(fragment);
    tableRendered = true;
  }

  svg.addEventListener('pointermove', (event) => {
    const index = indexFromEvent(event);
    if (index !== null) emitHover(index);
  });
  svg.addEventListener('pointerdown', (event) => {
    const index = indexFromEvent(event);
    if (index !== null) emitHover(index);
  });
  svg.addEventListener('pointerleave', () => emitHover(null));
  svg.addEventListener('focus', () => {
    if (!state.isEmpty) emitHover(activeIndex === null ? state.points.length - 1 : activeIndex);
  });
  svg.addEventListener('blur', () => emitHover(null));
  svg.addEventListener('keydown', (event) => {
    if (state.isEmpty || !state.points.length) return;
    const last = state.points.length - 1;
    const current = activeIndex === null ? last : activeIndex;
    const jump = event.shiftKey ? 12 : 1;
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(last, current + jump);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, current - jump);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Escape') { emitHover(null); return; }
    if (next === null) return;
    event.preventDefault();
    emitHover(next);
  });

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    tableWrap.hidden = open;
    toggle.textContent = open ? labels.showTable : labels.hideTable;
    if (!open && !tableRendered) renderTable();
  });

  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    })
    : null;
  if (observer) observer.observe(plot);
  else window.addEventListener('resize', render);

  return {
    /** @param {{points: Array<{month: number, value: number}>, domain: {min: number, max: number}, months: number, isEmpty?: boolean, emptyMessage?: string}} next */
    update(next) {
      state = {
        points: next.points,
        domain: next.domain,
        months: next.months,
        isEmpty: Boolean(next.isEmpty),
      };
      empty.textContent = next.emptyMessage || '';
      if (activeIndex !== null) activeIndex = Math.min(activeIndex, state.points.length - 1);
      render();
      if (tableRendered) renderTable();
      else tbody.textContent = '';
    },
    setActive,
    element: figure,
    /** Detach observers and remove the card — used when rebuilding in another language. */
    destroy() {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', render);
      cancelAnimationFrame(frame);
      figure.remove();
    },
  };
}
