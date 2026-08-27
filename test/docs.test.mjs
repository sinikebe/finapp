import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/*
 * The docs describe the code rather than summarising it, which is what makes
 * them worth reading — and what makes a stale line in them costly. Most of what
 * they claim only a reader can check. These two lists are the exception: they
 * are enumerations of things the repository already knows about itself, so
 * nothing has to remember to update them by hand. Both live in CONTRIBUTING.md,
 * which is where the mechanics went when the README was cut back to describing
 * the app.
 */

const contributing = await readFile(new URL('../CONTRIBUTING.md', import.meta.url), 'utf8');

/** The contents of the fenced block under a heading. */
function blockUnder(heading) {
  const after = contributing.split(`\n## ${heading}\n`)[1];
  assert.ok(after, `CONTRIBUTING.md has no "${heading}" section`);
  const fenced = after.split('```')[1];
  assert.ok(fenced, `the "${heading}" section has no fenced block`);
  return fenced;
}

test('the Layout block lists every module and tool the project ships', async () => {
  // The block presents itself as the file list, so a file missing from it is
  // one a reader has no way to learn exists — which is how `stamp-version.mjs`,
  // the only tool nothing else in the docs mentions, stayed unlisted.
  const layout = blockUnder('Layout');
  for (const directory of ['assets/js', 'tools']) {
    const names = await readdir(new URL(`../${directory}/`, import.meta.url));
    assert.ok(names.length > 0, `${directory} has files to list`);
    for (const name of names) {
      assert.ok(layout.includes(`${directory}/${name}`), `Layout does not list ${directory}/${name}`);
    }
  }
});

test('every npm script is one the docs tell you to run', async () => {
  // A script nobody is told about is a manual step nobody takes: the version
  // stamp was one, and the docs said the project had no such step at all.
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const shown = blockUnder('Run it');
  for (const script of Object.keys(manifest.scripts)) {
    const invocation = script === 'start' || script === 'test' ? `npm ${script}` : `npm run ${script}`;
    assert.ok(shown.includes(invocation), `"Run it" does not mention ${invocation}`);
  }
});

test('the README points at the contributing guide it handed those mechanics to', async () => {
  // Cutting the README only works if what left it stays reachable from it.
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes('(CONTRIBUTING.md)'), 'the README links to CONTRIBUTING.md');
});
