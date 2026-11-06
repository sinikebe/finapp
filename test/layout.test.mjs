import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../assets/css/app.css', import.meta.url), 'utf8');
const markup = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('touch overrides are last and every disclosure has a 44px target', () => {
  const atRules = [...css.matchAll(/^@[\w-]+[^{]*/gm)].map((one) => one[0].trim());
  assert.equal(atRules.at(-1), '@media (pointer: coarse)');
  const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
  for (const kind of new Set([...markup.matchAll(/<details class="([\w-]+)"/g)].map((one) => one[1]))) {
    assert.ok(coarse.includes(`.${kind} > summary`), kind);
  }
  assert.match(coarse, /min-height:\s*44px/);
});

test('phone document order puts results and comparison before editable data', () => {
  const at = (id) => markup.indexOf(`id="${id}"`);
  assert.ok(at('horizon') < at('summary'));
  assert.ok(at('summary') < at('compare'));
  assert.ok(at('compare') < at('inputs'));
  assert.ok(at('inputs') < at('charts'));
  assert.match(css, /grid-template-areas:\s*"head" "horizon" "summary" "compare" "data" "output"/);
});

test('reading columns can shrink and no form has an internal scrollport', () => {
  const workspace = css.slice(css.indexOf('/* Workspace hierarchy:'));
  assert.match(workspace, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(workspace, /grid-template-columns:\s*minmax\(340px, 420px\) minmax\(0, 1fr\)/);
  assert.match(workspace, /\.rail\s*\{[^}]*max-height:\s*none;[^}]*overflow:\s*visible;[^}]*grid-template-rows:\s*auto/);
  assert.match(workspace, /#inputs-body\s*\{[^}]*max-height:\s*none;[^}]*overflow:\s*visible/);
  assert.ok(!workspace.includes('overflow-y: auto'), 'only the page scrolls while editing');
});

test('scenario selection survives folding and the fold has an explicit accessible target', () => {
  const body = markup.split('id="inputs-body"')[1].split('</section>')[0];
  assert.ok(!body.includes('id="strategies"'));
  const button = markup.match(/<button[^>]*id="rail-toggle"[^>]*>/)[0];
  assert.match(button, /aria-controls="inputs-body"/);
  assert.match(button, /aria-expanded="true"/);
});

test('global assumptions stay outside the active scenario form', () => {
  const form = markup.split('id="inputs"')[1].split('</section>')[0];
  for (const id of ['real-toggle', 'range-toggle', 'inflation', 'tax', 'spread']) assert.ok(!form.includes(`id="${id}"`), id);
  assert.ok(markup.includes('id="active-assumptions"'));
});

test('the Simple view keeps comparison, validation, saving and backup access', () => {
  for (const id of ['mode-simple', 'mode-advanced', 'simple-comparison', 'input-warning', 'save-status', 'backup-open']) assert.ok(markup.includes(`id="${id}"`), id);
  assert.match(css, /body\[data-mode="simple"\] \.advanced-only/);
  assert.match(css, /body\[data-mode="advanced"\] \.simple-only/);
  for (const id of ['simple-comparison', 'input-warning', 'save-status']) {
    const element = markup.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))[0];
    assert.ok(!element.includes('advanced-only'), id);
  }
});

test('projects open a sheet while scenarios have a separately labelled select', async () => {
  const source = await readFile(new URL('../assets/js/strategy-bar.js', import.meta.url), 'utf8');
  assert.match(source, /html\('select', 'scenario-select'/);
  assert.match(source, /label\.htmlFor = select\.id/);
  assert.match(source, /rename\.addEventListener\('click', open\)/);
  assert.ok(!source.includes("html('input', 'strategy-name', wrap)"));
  assert.match(css, /\.project-switch-mark \{[^}]*border-left:/);
});
