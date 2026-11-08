import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { helpPlacement } from '../assets/js/help.js';
import { makeTranslator } from '../assets/js/i18n.js';

test('help panels fit narrow, short and zoomed visible viewports at every screen edge', () => {
  for (const viewport of [
    { width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 768, height: 400 }, { width: 1280, height: 720 },
    { x: 90, y: 120, width: 320, height: 360 },
  ]) {
    const x = viewport.x || 0; const y = viewport.y || 0;
    for (const left of [x, x + 100, x + viewport.width - 32]) {
      for (const top of [y, y + viewport.height / 2, y + viewport.height - 32]) {
        for (const height of [80, 240, 2000]) {
          const panel = helpPlacement({ left, top, bottom: top + 32 }, viewport, height);
          assert.ok(panel.left >= x + 12);
          assert.ok(panel.left + panel.width <= x + viewport.width - 12);
          assert.ok(panel.top >= y + 12);
          assert.ok(panel.top + Math.min(height, panel.maxHeight) <= y + viewport.height - 12);
          assert.ok(panel.width <= 360);
        }
      }
    }
  }
});

test('help appears below a trigger when possible and above a low trigger', () => {
  const viewport = { width: 1280, height: 720 };
  assert.equal(helpPlacement({ left: 100, top: 100, bottom: 132 }, viewport, 200).top, 140);
  assert.equal(helpPlacement({ left: 100, top: 650, bottom: 682 }, viewport, 200).top, 442);
});

test('each declared help topic has a purpose in both languages', async () => {
  const markup = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const keys = [...markup.matchAll(/data-help="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(keys.length >= 15);
  for (const language of ['en', 'fr']) {
    const t = makeTranslator(language);
    for (const key of keys) {
      assert.notEqual(t(key), key, key);
      assert.ok(t('help.label', t(key)).includes(t(key)));
    }
  }
});
