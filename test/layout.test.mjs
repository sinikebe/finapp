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

test('the assumptions sit outside the panel that belongs to one plan', () => {
  /*
   * The load-bearing fact of the left column, and it is a claim about meaning
   * rather than about pixels. `months`, `inflation`, `spread`, `tax`,
   * `realMoney` and `showRange` are siblings of `strategies` in the state, not
   * properties of one: every plan is read through the same set. The inputs
   * panel, though, sits under a strategy switcher, and everything inside it
   * belongs to the plan that switcher names.
   *
   * Put these controls in there and the layout says the opposite of what the
   * model does — that switching plan switches the assumptions with it, and
   * that two plans compared were read on different terms. They are not, and a
   * comparison would mean nothing if they were. So they live in a panel of
   * their own, and this is what keeps them there.
   */
  const rail = markup.slice(markup.indexOf('<div class="rail">'), markup.indexOf('<div class="output">'));
  assert.ok(rail.includes('assumptions-panel'), 'the assumptions are in the left column');

  const inputs = rail.slice(rail.indexOf('class="panel inputs-panel"'));
  const perPlan = inputs.slice(0, inputs.indexOf('</section>'));
  for (const id of ['real-toggle', 'range-toggle', 'inflation', 'tax', 'spread']) {
    assert.ok(
      !perPlan.includes(`id="${id}"`),
      `${id} applies to every plan at once, so it must not sit inside the panel a strategy switcher names`,
    );
  }
});

test('the rail lets the fields give up room rather than pushing the assumptions off the screen', () => {
  /*
   * The column is capped at the height of the window and holds two panels. Its
   * first row therefore has to be allowed to shrink: written `auto`, the fields
   * keep their full height, the rows overflow a box that is not scrolling, and
   * the assumptions are laid out past the bottom edge of a sticky element —
   * on screen by every measurement, and reachable by no amount of scrolling.
   *
   * That is exactly what happened when this was built, and it is invisible in
   * a diff: `minmax(0, auto)` and `minmax(0, 1fr)` differ by three characters.
   */
  const rows = css.match(/\.rail\s*\{[^}]*grid-template-rows:([^;]+)/);
  assert.ok(rows, 'the rail sizes its rows');
  assert.match(
    rows[1],
    /minmax\(0,\s*1fr\)/,
    `the rail's first row is ${rows[1].trim()}; the fields have to be able to shrink and scroll`,
  );
});

test('every disclosure in the app is a thumb-sized target', () => {
  /*
   * A <summary> is 28px of text and nothing else — there is no control in the
   * app that is further from 44px by default, and there are now three kinds of
   * them. Each was added in a different pass, and the first two were given
   * their padding by hand; this is what stops the fourth from being missed.
   */
  const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
  const summaries = [...markup.matchAll(/<details class="([\w-]+)"/g)].map((m) => m[1]);
  assert.ok(summaries.length >= 3, 'the app has disclosures to hold to this');
  for (const kind of new Set(summaries)) {
    assert.ok(
      coarse.includes(`.${kind} > summary`),
      `.${kind} has no coarse-pointer rule, so its summary is 28px under a thumb`,
    );
  }
});

test('the dock is a column of readings, never a box that scrolls inside itself', () => {
  /*
   * The rail is a scrollport because it holds controls you work while watching
   * the figures move, and its own head is what pins the switcher. The dock
   * holds figures. A reading that has to be scrolled out from behind its own
   * edge is worse than one that scrolls with the page, because nothing tells
   * the reader it is there.
   *
   * Measured while this was being built, with the dock capped at the window:
   * 97px of the ranking hidden on a 3440x900 screen and 277px on a 2560x720
   * one — an ultrawide driven from a laptop, which is not an exotic machine.
   * Sticky without the cap is the same bug wearing a hat: a box taller than
   * the window sticks at once and holds its own foot below the fold.
   */
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const [, selector, body] of rules) {
    if (!/\.dock\b/.test(selector)) continue;
    for (const banned of ['overflow-y', 'overflow', 'max-height', 'position: sticky']) {
      assert.ok(
        !new RegExp(`${banned}\\s*:`).test(body),
        `${selector.trim()} sets ${banned}; the dock must not become a scrollport — `
        + 'a reading behind its own edge is a reading nobody finds',
      );
    }
  }
});

test('every dock state the stylesheet lays out is one the app can actually write', async () => {
  /*
   * The dock's width is sized for the comparison, which is the app's one
   * starved section. But `rankable` counts fields rather than plans, so a
   * single plan with a few amounts hides the comparison and still shows the
   * ranking — and said as one boolean, that plan reserved the comparison's
   * width for a list that could not use it. Measured on a 5120px screen before
   * this was split three ways: 1,940px of column holding an 820px reading.
   *
   * So the attribute names its cargo, and this is what keeps the two halves in
   * step — a value the stylesheet lays out but the app never writes is a rule
   * that never fires, and a value the app writes but the stylesheet does not
   * know is a column with no width.
   */
  const app = await readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  const written = new Set([...app.matchAll(/dataset\.dock\s*=([^;]+);/gs)]
    .flatMap((match) => [...match[1].matchAll(/'([\w-]+)'/g)].map((one) => one[1])));
  const laidOut = new Set([...css.matchAll(/\[data-dock="([\w-]+)"\]/g)].map((match) => match[1]));

  assert.ok(written.size >= 3, `app.js writes ${[...written]}; the dock has three states, not two`);
  for (const state of laidOut) {
    assert.ok(written.has(state), `app.css lays out [data-dock="${state}"], which app.js never writes`);
  }
  for (const state of written) {
    assert.ok(
      laidOut.has(state) || state === 'on',
      `app.js writes data-dock="${state}", which app.css never lays out`,
    );
  }
});

test('every layout that gives main its columns also says what the fold does to them', () => {
  /*
   * The fold is written once, high up, as a two-column grid. Every tier that
   * re-declares `main`'s columns therefore has to re-declare the folded case
   * too, because a media query adds no specificity and the later rule simply
   * wins — silently, with no error and nothing in the diff to look at.
   *
   * It happened: the dock's three-column rule out-ordered the fold, and above
   * 2400 the chevron turned, `data-rail` said closed, the panel emptied itself,
   * and the column stayed 354px wide. Measured 354 -> 354 at 2400, 2560, 3440
   * and 5120 — the fold inert on exactly the screens it was built for.
   *
   * So: for every rule that sets grid-template-columns on `main`, there must be
   * a folded counterpart no earlier in the file.
   */
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const onMain = rules
    .map((match, index) => ({ selector: match[1].trim(), body: match[2], index, at: match.index }))
    .filter((rule) => /(^|[\s,])(body[^\s,]*\s+)?main\b/.test(rule.selector)
      && /grid-template-columns\s*:/.test(rule.body));

  assert.ok(onMain.length >= 2, 'main is given columns in more than one place');

  const folded = onMain.filter((rule) => /data-rail="closed"/.test(rule.selector));
  assert.ok(folded.length >= 2, 'the fold restates main\'s columns for more than the base layout');

  const lastFolded = Math.max(...folded.map((rule) => rule.at));
  for (const rule of onMain) {
    if (/data-rail="closed"/.test(rule.selector)) continue;
    assert.ok(
      rule.at < lastFolded,
      `\`${rule.selector}\` sets main's columns after the last folded rule, so folding `
      + 'cannot override it — the fold would turn its chevron and change nothing',
    );
  }
});
