/**
 * chart.js — a line chart, drawn as SVG with no dependencies.
 *
 * A chart holds one or more series. With one, it draws the area under the line
 * and the card's title says what it is; with several — comparing strategies —
 * it draws lines only, with a legend, because overlapping washes are mush.
 *
 * Nothing is gated behind hovering: endpoints are direct-labelled where they
 * fit, the crosshair follows pointer and keyboard alike, and every card carries
 * a table of the same numbers.
 */

import { html, svgEl } from './dom.js';

const PLOT_HEIGHT = 180;
const TOP_PAD = 14;
const X_AXIS_BAND = 26;
const LEFT_PAD = 46;
const MIN_RIGHT_PAD = 44;
const MIN_PLOT_WIDTH = 120;
const CHAR_WIDTH = 7.4; // 12px semibold system sans, close enough to reserve space
const MARKER_RADIUS = 4.5;
const LABEL_GAP = 15; // two end-labels closer than this would overlap
const X_TICK_STEPS = [1, 2, 3, 6, 12, 24, 36, 60, 120, 240];

/** Width to reserve for an end-label, so sibling charts can agree on one. */
export function endLabelPad(text) {
  return Math.max(MIN_RIGHT_PAD, Math.ceil(text.length * CHAR_WIDTH) + 16);
}

/** Round a scale value away from float noise (0.30000000000000004 → 0.3). */
function tidy(value, step) {
  const decimals = Math.max(0, Math.min(10, -Math.floor(Math.log10(Math.abs(step))) + 2));
  return Number(value.toFixed(decimals));
}

/** A y-domain snapped outward to human tick values (0 / 20K / 40K …). */
export function niceScale(min, max, target = 4) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  // Nothing to plot yet: a whole-number 0–1 axis, never 0.25-of-a-cent ticks.
  if (hi - lo === 0) return { min: lo, max: lo + 1, step: 1, ticks: [lo, lo + 1] };
  const rawStep = (hi - lo) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const nice = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  // The same floor the flat case above takes, for the same reason: the tick
  // labels are compact to one decimal, so a step of 0.25 gives gridlines that
  // print as 0.3 and 0.8 — a line misstating its own value — and a step of
  // 0.0025 prints five zeroes. It is not money either: a quarter of a cent is
  // not a figure this app deals in.
  const step = Math.max(1, nice * magnitude);
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
 *   labels: {showTable: string, hideTable: string, tableCaption: string,
 *            monthColumn: string, ariaLabel: (months: number, endValue: string, count: number) => string,
 *            reading: (month: string, value: string) => string,
 *            seriesReading: (label: string, value: string) => string},
 *   formatValue: (n: number) => string, formatTick: (n: number) => string,
 *   formatMonth: (n: number) => string, onHover?: (index: number|null) => void
 * }} options
 */
export function createLineChart(options) {
  const {
    mount, id, title, description,
    formatValue, formatTick, formatMonth, onHover,
  } = options;
  // Re-worded rather than rebuilt when the language changes: a card carries the
  // reader's open table in its own closure, and rebuilding it to change a
  // heading shuts the table with it.
  let labels = options.labels;

  const figure = html('figure', 'chart-card', mount);

  const caption = html('figcaption', 'chart-head', figure);
  const heading = html('h3', 'chart-title', caption);
  heading.textContent = title;
  const sub = html('p', 'chart-desc', caption);
  sub.textContent = description;

  // Identity never rides on colour alone: two or more series get a legend, and
  // one needs none — the title already names what is drawn.
  const legend = html('ul', 'chart-legend', figure);
  legend.hidden = true;

  const plot = html('div', 'chart-plot', figure);
  const svg = svgEl('svg', {
    class: 'chart-svg', role: 'img', tabindex: '0',
    preserveAspectRatio: 'xMidYMid meet',
  }, plot);

  const tooltip = html('div', 'chart-tip', plot);
  tooltip.hidden = true;
  tooltip.setAttribute('aria-hidden', 'true');
  const tipRows = html('div', 'chart-tip-rows', tooltip);
  const tipMonth = html('span', 'chart-tip-month', tooltip);

  const empty = html('p', 'chart-empty', plot);
  empty.hidden = true;

  // Keyboard readings are announced here. Pointer hovering deliberately stays
  // silent — a live region firing on every mouse move is unusable.
  const announcer = html('p', 'sr-only', figure);
  announcer.setAttribute('aria-live', 'polite');

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
  const tbody = html('tbody', null, table);

  // Painted once, then mutated in place on every update. Grouping by kind keeps
  // the paint order right however many series arrive: grid, fills, lines, then
  // everything that has to stay readable on top.
  const gridLayer = svgEl('g', { class: 'layer-grid' }, svg);
  // Beneath everything: a band is context for its line, never a mark in its
  // own right, so it is painted first and the line goes over the top of it.
  const bandGroup = svgEl('g', { class: 'layer-bands' }, svg);
  const areaGroup = svgEl('g', { class: 'layer-areas' }, svg);
  const lineGroup = svgEl('g', { class: 'layer-lines' }, svg);
  const zeroLine = svgEl('line', { class: 'axis-zero' }, svg);
  const xAxisLine = svgEl('line', { class: 'axis-line' }, svg);
  const xLabels = svgEl('g', { class: 'layer-xlabels' }, svg);
  const crosshair = svgEl('line', { class: 'crosshair' }, svg);
  const markerGroup = svgEl('g', { class: 'layer-markers' }, svg);
  const labelGroup = svgEl('g', { class: 'layer-labels' }, svg);

  /** One series' worth of nodes, across the groups it paints into. */
  const layers = [];

  function addLayer() {
    const band = svgEl('path', { class: 'series-band' }, bandGroup);
    const area = svgEl('path', { class: 'series-area' }, areaGroup);
    const line = svgEl('path', { class: 'series-line' }, lineGroup);
    const endRing = svgEl('circle', { class: 'end-ring', r: MARKER_RADIUS + 2 }, markerGroup);
    const endDot = svgEl('circle', { class: 'end-dot', r: MARKER_RADIUS }, markerGroup);
    const focusRing = svgEl('circle', { class: 'focus-ring', r: MARKER_RADIUS + 2 }, markerGroup);
    const focusDot = svgEl('circle', { class: 'focus-dot', r: MARKER_RADIUS }, markerGroup);
    const endLabel = svgEl('text', { class: 'end-label', 'text-anchor': 'start', dy: '0.32em' }, labelGroup);

    const legendItem = html('li', 'legend-item', legend);
    html('span', 'legend-key', legendItem);
    const legendLabel = html('span', 'legend-label', legendItem);

    const tipRow = html('div', 'chart-tip-row', tipRows);
    html('span', 'chart-tip-key', tipRow);
    const tipLabel = html('span', 'chart-tip-label', tipRow);
    const tipValue = html('strong', 'chart-tip-value', tipRow);

    const layer = {
      band, area, line, endRing, endDot, focusRing, focusDot, endLabel,
      legendItem, legendLabel, tipRow, tipLabel, tipValue,
      th: null,
    };
    layers.push(layer);
    return layer;
  }

  function ensureLayers(count) {
    while (layers.length < count) addLayer();
    while (layers.length > count) {
      const layer = layers.pop();
      for (const node of [layer.band, layer.area, layer.line, layer.endRing, layer.endDot,
        layer.focusRing, layer.focusDot, layer.endLabel, layer.legendItem, layer.tipRow]) {
        node.remove();
      }
      if (layer.th) layer.th.remove();
      if (layer.thLow) layer.thLow.remove();
      if (layer.thHigh) layer.thHigh.remove();
    }
  }

  /** Table columns follow the series, so a strategy added is a column added. */
  function syncColumns(series) {
    layers.forEach((layer, index) => {
      if (!layer.th) {
        layer.th = html('th', 'num', headRow);
        layer.th.scope = 'col';
      }
      layer.th.textContent = series[index].label;
      // A band's bounds belong in the table too: the app's rule is that no
      // figure lives only inside a drawing.
      if (series[index].band) {
        if (!layer.thLow) {
          layer.thLow = html('th', 'num', headRow);
          layer.thLow.scope = 'col';
          layer.thHigh = html('th', 'num', headRow);
          layer.thHigh.scope = 'col';
        }
        layer.thLow.textContent = series[index].band.lowLabel;
        layer.thHigh.textContent = series[index].band.highLabel;
      } else if (layer.thLow) {
        layer.thLow.remove();
        layer.thHigh.remove();
        layer.thLow = null;
        layer.thHigh = null;
      }
    });
    // A row of cells is written series by series — value, then its bounds — so
    // the header has to be in that order too. Appending puts a band's columns
    // after every series' own, which is right only when the band arrives with
    // the column: turn the range on afterwards and the headings slide off the
    // figures they name. Ordering them here cannot drift.
    for (const layer of layers) {
      for (const cell of [layer.th, layer.thLow, layer.thHigh]) {
        if (cell) headRow.appendChild(cell);
      }
    }
  }

  let state = {
    series: [], domain: { min: 0, max: 1 }, months: 1, isEmpty: true, labelPad: 0,
  };
  let geometry = null;
  let activeIndex = null;
  let tableRendered = false;
  let frame = 0;

  function pointsOf(index) {
    return state.series[index] ? state.series[index].points : [];
  }

  function width() {
    return Math.max(240, Math.round(plot.clientWidth || mount.clientWidth || 320));
  }

  function setCrosshairVisible(visible) {
    crosshair.style.display = visible ? '' : 'none';
    for (const layer of layers) {
      layer.focusRing.style.display = visible ? '' : 'none';
      layer.focusDot.style.display = visible ? '' : 'none';
    }
    tooltip.hidden = !visible;
  }

  // Nothing is hovered yet, so the crosshair layer starts out of the way.
  setCrosshairVisible(false);

  function render() {
    const { series, domain, months, isEmpty } = state;
    const w = width();
    const scale = niceScale(domain.min, domain.max);
    const endValues = series.map((s) => (s.points.length ? s.points[s.points.length - 1].value : 0));
    const widest = endValues.reduce(
      (pad, value) => Math.max(pad, endLabelPad(formatValue(value))),
      MIN_RIGHT_PAD,
    );

    // Reserve room for the end-labels, but never at the cost of the plot: a
    // label that would squeeze the chart is dropped rather than clipped, and the
    // table view keeps the value reachable. `labelPad` lets sibling charts
    // reserve the same width, so small multiples stay drawn to one geometry.
    const wantedRightPad = Math.max(state.labelPad || 0, widest);
    const labelFits = w - LEFT_PAD - wantedRightPad >= MIN_PLOT_WIDTH;
    const rightPad = labelFits ? wantedRightPad : MIN_RIGHT_PAD;
    const plotW = Math.max(40, w - LEFT_PAD - rightPad);
    const height = TOP_PAD + PLOT_HEIGHT + X_AXIS_BAND;

    svg.setAttribute('viewBox', `0 0 ${w} ${height}`);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(height));

    const span = scale.max - scale.min || 1;
    const xOf = (month) => LEFT_PAD + (months ? (month / months) * plotW : 0);
    const yOf = (value) => TOP_PAD + PLOT_HEIGHT - ((value - scale.min) / span) * PLOT_HEIGHT;

    geometry = { xOf, yOf, plotW, plotH: PLOT_HEIGHT, height, scale };

    const hasSeries = !isEmpty && series.some((s) => s.points.length > 1);
    const baseY = TOP_PAD + PLOT_HEIGHT;

    // --- gridlines + y ticks -------------------------------------------------
    gridLayer.textContent = '';
    for (const tick of scale.ticks) {
      const y = yOf(tick);
      svgEl('line', { class: 'grid-line', x1: LEFT_PAD, x2: LEFT_PAD + plotW, y1: y, y2: y }, gridLayer);
      const label = svgEl('text', {
        class: 'tick-label', x: LEFT_PAD - 8, y, 'text-anchor': 'end', dy: '0.32em',
      }, gridLayer);
      label.textContent = formatTick(tick);
    }

    // --- axes ----------------------------------------------------------------
    // An empty card is just its message: no axis, no grid, no ticks to read.
    for (const node of [gridLayer, xLabels, xAxisLine]) {
      node.style.display = hasSeries ? '' : 'none';
    }

    xAxisLine.setAttribute('x1', LEFT_PAD);
    xAxisLine.setAttribute('x2', LEFT_PAD + plotW);
    xAxisLine.setAttribute('y1', baseY);
    xAxisLine.setAttribute('y2', baseY);

    const crossesZero = hasSeries && scale.min < 0 && scale.max > 0;
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
      const label = svgEl('text', {
        class: 'tick-label', x: xOf(month), y: baseY + 16, 'text-anchor': 'middle',
      }, xLabels);
      label.textContent = String(month);
    }

    // --- series --------------------------------------------------------------
    // A single series gets its area; several would paint mud over each other.
    const showArea = hasSeries && series.length === 1;
    const placed = [];

    layers.forEach((layer, index) => {
      const s = series[index];
      const points = s ? s.points : [];
      const drawn = hasSeries && points.length > 1;

      layer.line.style.stroke = s ? s.color : '';
      // A dashed line is a reference — what was paid in, a target — rather than
      // another category. It says "compare against me", so it is drawn without
      // an end dot and never takes a slot in the categorical palette.
      layer.line.classList.toggle('is-reference', Boolean(s && s.dashed));
      layer.band.style.fill = s ? s.color : '';
      layer.area.style.fill = s ? s.color : '';
      layer.endDot.style.fill = s ? s.color : '';
      layer.focusDot.style.fill = s ? s.color : '';
      layer.legendItem.style.setProperty('--series', s ? s.color : 'transparent');
      layer.tipRow.style.setProperty('--series', s ? s.color : 'transparent');
      layer.legendLabel.textContent = s ? s.label : '';
      layer.tipLabel.textContent = s ? s.label : '';

      const band = s && s.band && points.length > 1 ? s.band : null;
      layer.line.style.display = drawn ? '' : 'none';
      layer.band.style.display = drawn && band ? '' : 'none';
      layer.area.style.display = drawn && showArea ? '' : 'none';
      const marked = drawn && !(s && s.dashed);
      layer.endRing.style.display = marked ? '' : 'none';
      layer.endDot.style.display = marked ? '' : 'none';

      if (!drawn) {
        layer.endLabel.style.display = 'none';
        return;
      }

      const commands = points.map(
        (p, i) => `${i ? 'L' : 'M'}${xOf(p.month).toFixed(2)},${yOf(p.value).toFixed(2)}`,
      ).join('');
      layer.line.setAttribute('d', commands);

      if (band) {
        // Out along the top, back along the bottom, closed: the region the
        // outcome could land in, rather than two more lines to tell apart.
        const top = band.high.map(
          (p, i) => `${i ? 'L' : 'M'}${xOf(p.month).toFixed(2)},${yOf(p.value).toFixed(2)}`,
        ).join('');
        const bottom = band.low.slice().reverse().map(
          (p) => `L${xOf(p.month).toFixed(2)},${yOf(p.value).toFixed(2)}`,
        ).join('');
        layer.band.setAttribute('d', `${top}${bottom}Z`);
      }

      if (showArea) {
        const zeroY = yOf(Math.min(Math.max(0, scale.min), scale.max));
        layer.area.setAttribute(
          'd',
          `${commands}L${xOf(months).toFixed(2)},${zeroY.toFixed(2)}L${xOf(0).toFixed(2)},${zeroY.toFixed(2)}Z`,
        );
      }

      const endX = xOf(months);
      const endY = yOf(endValues[index]);
      for (const node of [layer.endRing, layer.endDot]) {
        node.setAttribute('cx', endX);
        node.setAttribute('cy', endY);
      }

      // Two labels on top of each other are worse than one label and a legend,
      // so a label that would collide with one already placed is dropped; the
      // legend and the table still carry its series.
      const labelY = Math.min(Math.max(endY, TOP_PAD + 6), baseY - 2);
      const collides = placed.some((y) => Math.abs(y - labelY) < LABEL_GAP);
      const showLabel = labelFits && !collides;
      layer.endLabel.style.display = showLabel ? '' : 'none';
      if (showLabel) {
        placed.push(labelY);
        layer.endLabel.setAttribute('x', endX + 10);
        layer.endLabel.setAttribute('y', labelY);
        layer.endLabel.textContent = formatValue(endValues[index]);
      }
    });

    legend.hidden = !hasSeries || series.length < 2;
    empty.hidden = hasSeries;
    svg.classList.toggle('is-empty', !hasSeries);

    svg.setAttribute('aria-label', hasSeries
      ? labels.ariaLabel(months, formatValue(endValues[0]), series.length)
      : empty.textContent);
    toggle.hidden = !hasSeries;
    if (!hasSeries && toggle.getAttribute('aria-expanded') === 'true') {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = labels.showTable;
      tableWrap.hidden = true;
    }

    if (activeIndex !== null) drawCrosshair(activeIndex);
  }

  function drawCrosshair(index) {
    if (!geometry || state.isEmpty || !state.series.length) return;
    const first = pointsOf(0);
    if (!first.length) return;

    const point = first[Math.min(index, first.length - 1)];
    if (!point) return;
    const x = geometry.xOf(point.month);

    crosshair.setAttribute('x1', x);
    crosshair.setAttribute('x2', x);
    crosshair.setAttribute('y1', TOP_PAD);
    crosshair.setAttribute('y2', TOP_PAD + PLOT_HEIGHT);

    // One tooltip, every series: the pointer never has to land on a line.
    let topY = TOP_PAD + PLOT_HEIGHT;
    layers.forEach((layer, layerIndex) => {
      const points = pointsOf(layerIndex);
      const own = points[Math.min(index, points.length - 1)];
      if (!own) return;
      const y = geometry.yOf(own.value);
      topY = Math.min(topY, y);
      layer.focusRing.setAttribute('cx', x);
      layer.focusRing.setAttribute('cy', y);
      layer.focusDot.setAttribute('cx', x);
      layer.focusDot.setAttribute('cy', y);
      // The same clamped index the value used, so a band never reads a month
      // the line is not showing.
      const at = Math.min(index, points.length - 1);
      const band = state.series[layerIndex] && state.series[layerIndex].band;
      const range = band && band.low[at] && band.high[at]
        ? ` (${formatValue(band.low[at].value)} – ${formatValue(band.high[at].value)})`
        : '';
      layer.tipValue.textContent = `${formatValue(own.value)}${range}`;
    });

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
    tooltip.style.top = `${(svgBox.top - plotBox.top) + topY * ratio}px`;
  }

  function indexFromEvent(event) {
    if (!geometry || !state.months) return null;
    const box = svg.getBoundingClientRect();
    if (!box.width) return null;
    const scaleX = Number(svg.getAttribute('width')) / box.width;
    const x = (event.clientX - box.left) * scaleX;
    const ratio = (x - LEFT_PAD) / geometry.plotW;
    const month = Math.round(Math.min(1, Math.max(0, ratio)) * state.months);
    return Math.min(Math.max(pointsOf(0).length - 1, 0), Math.max(0, month));
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
    const months = pointsOf(0);
    months.forEach((point, index) => {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = String(point.month);
      row.appendChild(th);
      for (const s of state.series) {
        const cell = document.createElement('td');
        cell.className = 'num';
        const own = s.points[index];
        cell.textContent = own ? formatValue(own.value) : '';
        row.appendChild(cell);
        if (!s.band) continue;
        for (const bound of [s.band.low, s.band.high]) {
          const edge = document.createElement('td');
          edge.className = 'num';
          edge.textContent = bound[index] ? formatValue(bound[index].value) : '';
          row.appendChild(edge);
        }
      }
      fragment.appendChild(row);
    });
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
  svg.addEventListener('pointerleave', (event) => {
    // A touch tap ends with a pointerleave; clearing there would blank the
    // reading the tap just asked for. Tapping elsewhere clears it (see app.js).
    if (event.pointerType === 'touch') return;
    emitHover(null);
  });
  svg.addEventListener('focus', () => {
    if (!state.isEmpty) emitHover(activeIndex === null ? pointsOf(0).length - 1 : activeIndex);
  });
  svg.addEventListener('blur', () => {
    announcer.textContent = '';
    emitHover(null);
  });
  svg.addEventListener('keydown', (event) => {
    const points = pointsOf(0);
    if (state.isEmpty || !points.length) return;
    const last = points.length - 1;
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

    const point = points[next];
    if (!point) return;
    // Every series at that month, so a comparison is heard the way it is seen.
    // Through the dictionary, because the separator is punctuation: French puts
    // a no-break space before a colon, and this was the one place in the app
    // that did not — so a French reader heard the outer colon spaced correctly
    // and every inner one not.
    const reading = state.series
      .map((s) => labels.seriesReading(s.label, formatValue((s.points[next] || { value: 0 }).value)))
      .join(', ');
    announcer.textContent = labels.reading(
      formatMonth(point.month),
      state.series.length > 1 ? reading : formatValue(point.value),
    );
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
    /**
     * @param {{
     *   series: Array<{id: string, label: string, color: string, points: Array<{month: number, value: number}>}>,
     *   domain: {min: number, max: number}, months: number,
     *   labelPad?: number, isEmpty?: boolean, emptyMessage?: string
     * }} next
     */
    update(next) {
      state = {
        series: next.series,
        domain: next.domain,
        months: next.months,
        isEmpty: Boolean(next.isEmpty),
        labelPad: next.labelPad || 0,
      };
      ensureLayers(state.series.length);
      syncColumns(state.series);
      empty.textContent = next.emptyMessage || '';
      // A crosshair from the previous data would otherwise hang over the empty
      // card, pointing at a value that is no longer on screen.
      if (state.isEmpty) activeIndex = null;
      if (activeIndex !== null) activeIndex = Math.min(activeIndex, Math.max(pointsOf(0).length - 1, 0));
      setCrosshairVisible(activeIndex !== null);
      render();
      if (tableRendered) renderTable();
      else tbody.textContent = '';
    },
    setActive,

    /** Retitle a card whose subject changes — the comparison card follows
     *  whichever quantity is being compared. */
    setHeading(next) {
      heading.textContent = next.title;
      sub.textContent = next.description;
      tableCaption.textContent = next.tableCaption;
    },

    /** Every other word the card owns, for a language change. The formatters
     *  and the reading are closures over the app's own translator, so they
     *  follow on their own; these three are text already written into the DOM,
     *  and the aria label is rewritten by the render. */
    setLabels(next) {
      labels = next;
      monthTh.textContent = labels.monthColumn;
      tableCaption.textContent = labels.tableCaption;
      toggle.textContent = toggle.getAttribute('aria-expanded') === 'true'
        ? labels.hideTable
        : labels.showTable;
      render();
    },

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
