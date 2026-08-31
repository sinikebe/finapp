import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/*
 * Four facts about the shell that nothing else can hold.
 *
 * The layout itself is a browser's job and no test here pretends otherwise —
 * what these four pin are the invariants that are invisible until they break,
 * and that break silently. Each one has been stated in a comment, in a plan, or
 * in a review at least once, and none of them has ever been held by anything
 * but somebody remembering.
 */

const css = await readFile(new URL('../assets/css/app.css', import.meta.url), 'utf8');
const markup = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('the coarse-pointer block is the last at-rule in the stylesheet', () => {
  /*
   * Every rule in it is an override of something above, and a media query adds
   * no specificity — so a rule filed after it with the same specificity wins,
   * and a thumb gets a 36px target with the stylesheet still saying 44 a few
   * lines up. That is the failure mode: not an error, just a control that is
   * quietly too small on exactly the devices the block exists for.
   *
   * The constraint has been written in prose three times in this file's
   * history and held by nothing. It is held here.
   */
  const atRules = [...css.matchAll(/^@[\w-]+[^{]*/gm)].map((match) => match[0].trim());
  assert.ok(atRules.length > 1, 'the stylesheet has at-rules to order');
  assert.equal(
    atRules.at(-1),
    '@media (pointer: coarse)',
    'the coarse-pointer block must stay last: a media query adds no specificity, '
    + `so anything after it out-orders it. Found ${atRules.at(-1)} after it.`,
  );
});

test('the two-column shell floors its reading column at zero, not at min-content', () => {
  /*
   * `1fr` is `minmax(auto, 1fr)`, and `auto` as a minimum is min-content: a
   * column written that way refuses to go narrower than the widest thing in it,
   * which here is a comparison table with four plans in it. The column then
   * pushes the grid wider than the shell, the shell wider than the window, and
   * the whole page scrolls sideways — on a desktop, where nobody looks for it.
   * The same reasoning is why every child of the reading column opts out of
   * `min-width: auto`.
   */
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const columns = rules
    .map(([, selector, body]) => [selector.trim(), body.match(/grid-template-columns:([^;]+)/)])
    .filter(([selector, found]) => found && /\bmain\b/.test(selector));

  assert.ok(columns.length >= 2, 'main is given columns somewhere — open and folded');
  for (const [selector, found] of columns) {
    assert.match(
      found[1],
      /minmax\(0,\s*1fr\)/,
      `${selector} sizes main's reading column with ${found[1].trim()}; it has to be minmax(0, 1fr)`,
    );
  }

  assert.match(
    css,
    /\.output > \* \{[^}]*min-width:\s*0/,
    'every child of the reading column opts out of min-width: auto',
  );
});

test('the strategy switcher stays outside the part of the form that folds', () => {
  /*
   * This is the regression guard for the pinned switcher, and the reason it is
   * a test rather than a comment is that the break is not where the change
   * would be. The bar at the top of the window shows itself when the switcher
   * in the form is off screen, asked with an IntersectionObserver. Move
   * #strategies inside the folded region and folding the form makes it
   * `display: none`, which reads as "off screen" — so the pinned bar appears
   * over the app bar with the window still at the top and nothing scrolled.
   *
   * It is also the plainer half of the same idea: changing plan is the one
   * thing you must still be able to do with the fields away.
   */
  const body = markup.split('id="inputs-body"')[1];
  assert.ok(body, 'index.html has the folding part of the form');
  const folded = body.slice(0, body.indexOf('</section>'));
  assert.ok(!folded.includes('id="strategies"'), 'the strategy switcher is not inside the fold');
  assert.ok(markup.includes('id="strategies"'), 'and it is still in the page');
});

test('the button that folds the form says what it folds, and which way it is', () => {
  // It is the one control in the app with no data-i18n, because its label is
  // one of two phrases depending on which way it would go — so what a screen
  // reader is told about it comes entirely from what setRail writes here.
  const button = markup.match(/<button[^>]*id="rail-toggle"[^>]*>/);
  assert.ok(button, 'index.html carries the button that folds the form');
  assert.match(button[0], /aria-controls="inputs-body"/, 'it names what it folds');
  assert.match(button[0], /aria-expanded="(true|false)"/, 'and ships saying which way it is');
});
