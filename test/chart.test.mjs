import test from 'node:test';
import assert from 'node:assert/strict';

import { niceScale, monthTickStep, endLabelPad } from '../assets/js/chart.js';

test('a scale snaps outward to round ticks that contain the data', () => {
  const scale = niceScale(0, 72012);
  assert.ok(scale.min <= 0 && scale.max >= 72012);
  assert.deepEqual(scale.ticks, [0, 20000, 40000, 60000, 80000]);
});

test('a scale always contains zero, above or below the data', () => {
  const negative = niceScale(-2000, 0);
  assert.ok(negative.min <= -2000);
  assert.equal(negative.max, 0);
  assert.ok(negative.ticks.includes(0));

  const positive = niceScale(400, 900);
  assert.equal(positive.min, 0);
  assert.ok(positive.max >= 900);
});

test('a flat series gets whole-number ticks, never fractions of a cent', () => {
  const scale = niceScale(0, 0);
  assert.deepEqual(scale.ticks, [0, 1]);
  assert.ok(scale.max > scale.min);
});

test('a live series gets whole-number ticks too, for the same reason', () => {
  // The flat case above already had this floor. Any other domain did not, so a
  // one-off income of 1 drew gridlines at 0.25 and 0.75 — labelled 0.3 and 0.8,
  // each stating a value it was not sitting on — and a domain of 0 to 0.01
  // printed five identical zeroes down the axis.
  assert.deepEqual(niceScale(0, 1).ticks, [0, 1]);
  assert.deepEqual(niceScale(0, 0.01).ticks, [0, 1]);
  assert.deepEqual(niceScale(0, 3).ticks, [0, 1, 2, 3]);
  assert.equal(niceScale(-0.5, 0.5).step >= 1, true, 'below zero as well');
  for (const [lo, hi] of [[0, 0], [0, 1], [0, 0.01], [-0.5, 0.5], [0, 72012], [400, 900]]) {
    assert.ok(niceScale(lo, hi).step >= 1, `step for ${lo}..${hi} is a whole unit`);
  }
});

test('ticks are evenly spaced and free of float noise', () => {
  const scale = niceScale(-1500, 5400);
  for (let i = 1; i < scale.ticks.length; i += 1) {
    assert.equal(Math.round((scale.ticks[i] - scale.ticks[i - 1]) * 1e6) / 1e6, scale.step);
    assert.equal(String(scale.ticks[i]).length <= 12, true);
  }
  assert.equal(scale.ticks[0], scale.min);
  assert.equal(scale.ticks[scale.ticks.length - 1], scale.max);
});

test('the month axis never shows more than six labels', () => {
  for (const months of [1, 2, 5, 12, 18, 24, 36, 60, 120, 240, 600]) {
    const step = monthTickStep(months);
    assert.ok(months / step <= 6, `${months} months → step ${step}`);
    assert.ok(step >= 1);
  }
  assert.equal(monthTickStep(24), 6);
  assert.equal(monthTickStep(120), 24);
});

test('an end-label reserve is at least the minimum gutter and grows with the text', () => {
  assert.equal(endLabelPad('12'), endLabelPad('1'));
  assert.ok(endLabelPad('1,234,567,890') > endLabelPad('120'));
});
