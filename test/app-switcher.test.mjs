import test from 'node:test';
import assert from 'node:assert/strict';
import { suiteLinks } from '../assets/js/app-switcher.js';

test('the logo launcher pairs corresponding main and development apps', () => {
  for (const directory of ['finapp', 'Garapp']) {
    for (const preview of [false, true]) {
      const suffix = preview ? 'dev/' : '';
      const links = suiteLinks(`https://sinikebe.github.io/${directory}/${suffix}`);
      assert.equal(links.preview, preview);
      assert.deepEqual(links.apps.map((app) => app.href), [`https://sinikebe.github.io/finapp/${suffix}`, `https://sinikebe.github.io/Garapp/${suffix}`]);
    }
  }
});

test('a sibling-app preview retains its own origin and prefix, without copying a query or fragment', () => {
  const links = suiteLinks('http://localhost:4173/preview/finapp/dev/?project=private#private-plan');
  assert.deepEqual(links.apps.map((app) => app.href), ['http://localhost:4173/preview/finapp/dev/', 'http://localhost:4173/preview/Garapp/dev/']);
  assert.ok(links.apps.every((app) => !app.href.includes('private')));
});
