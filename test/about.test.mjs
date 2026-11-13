import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { RELEASES } from '../assets/js/changelog.js';
import { BUILD } from '../assets/js/version.js';
import { LANGUAGES } from '../assets/js/i18n.js';
import { breakingSpaceIn } from './french-spacing.mjs';

test('the local fallback is public SemVer, separate from its technical cache baseline', async () => {
  // The local fallback and technical cache baseline remain separate inputs.
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const served = sw.match(/^const CACHE_VERSION = '([^']+)'/m);
  assert.ok(served, 'sw.js declares a CACHE_VERSION');
  assert.equal(BUILD.cacheGeneration, served[1]);
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(BUILD.version, '0.0.1');
  assert.equal(BUILD.version, manifest.version);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[''].version, manifest.version);
});

test('the build stamp is filled in and shaped like itself', () => {
  assert.match(BUILD.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.match(BUILD.commit, /^[0-9a-f]{7,40}$/, 'an abbreviated commit hash');
  assert.match(BUILD.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(BUILD.branch.length > 0);
  assert.ok(Object.isFrozen(BUILD));
});

test('every release is dated, named and attributable', () => {
  assert.ok(RELEASES.length > 0);
  for (const release of RELEASES) {
    assert.match(release.version, /^v\d+$/, `${release.version} is a version`);
    assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/, `${release.version} is dated`);
    // Exact, unlike the running build's: a merged release is history. Only the
    // newest may lack one — it is created by the merge that publishes it.
    if (release !== RELEASES[0]) {
      assert.match(release.commit, /^[0-9a-f]{7,40}$/, `${release.version} names its commit`);
    }
    for (const language of LANGUAGES) {
      assert.equal(typeof release[language], 'string', `${release.version} speaks ${language}`);
      assert.ok(release[language].trim().length > 0, `${release.version} says something in ${language}`);
    }
  }
});

test('the log runs newest first, with no version told twice', () => {
  const numbers = RELEASES.map((release) => Number(release.version.slice(1)));
  for (let i = 1; i < numbers.length; i += 1) {
    assert.ok(numbers[i] < numbers[i - 1], `${RELEASES[i].version} comes after ${RELEASES[i - 1].version}`);
  }
  const commits = RELEASES.map((r) => r.commit).filter(Boolean);
  assert.equal(new Set(commits).size, commits.length, 'each commit once');
});

test('the technical baseline remains described in the archived history', () => {
  // Historical cache generations keep their original release notes.
  assert.ok(
    RELEASES.some((release) => release.version === BUILD.cacheGeneration),
    `${BUILD.cacheGeneration} has no archive entry`,
  );
});

test('French in the log follows the same typography as the dictionary', () => {
  // The changelog lives outside i18n.js, so it would otherwise sit outside the
  // rule too — which is why the rule is a module both files import rather than
  // a regex each of them keeps its own copy of.
  for (const release of RELEASES) {
    const broken = breakingSpaceIn(release.fr);
    assert.equal(broken, null, `${release.version} uses a breaking space in "${broken}": ${release.fr}`);
  }
});

test('the visible footer and About share the public build version', async () => {
  const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  const footer = page.slice(page.indexOf('<footer'), page.indexOf('</footer>'));
  assert.ok(footer.includes('id="footer-version">v0.0.1</span>'));
  assert.ok(app.includes('ui.footerVersion.textContent = versionLabel;'));
  assert.ok(app.includes('ui.aboutVersion.textContent = versionLabel;'));
});
