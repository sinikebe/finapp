import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/*
 * Two scales, held to being scales.
 *
 * The stylesheet had thirteen font sizes and no type token at all, and six of
 * the thirteen were half-pixel neighbours of another: 12 beside 12.5, 13 beside
 * 13.5, 14 beside 14.5. Nobody chose that. It is what happens when each rule is
 * written next to the one it resembles and nothing in the repository can tell
 * the difference between a step and a typo — a diff reading `13.5px` where the
 * rule above says `13px` looks exactly like a decision.
 *
 * Spacing went the same way: 8, 6, 4, 12, 10, 2, 20 and 16 doing the work, and
 * then single appearances of 14, 18, 9, 7, 5, 3 and 1 with nothing to say why.
 *
 * So the values live in `:root` now, and these two tests are what stops the
 * fourteenth size from arriving. They are deliberately narrow. `font-size` and
 * `gap` are the two properties where every single occurrence really is a step
 * on a scale, which is what makes a guard over them a guard rather than a list
 * of exceptions: padding and margin are mostly steps but also carry a handful
 * of measurements — the height of the pinned bar, the room a unit printed
 * inside a box needs — and a rule that had to allow those would allow anything.
 * Those are enumerated in docs/design-system.md instead, and each says why
 * where it stands.
 */

const css = await readFile(new URL('../assets/css/app.css', import.meta.url), 'utf8');

/** The base `:root` block, which is where both scales are declared. */
function rootBlock() {
  const at = css.search(/^:root \{/m);
  assert.ok(at >= 0, 'the stylesheet opens with a :root block');
  const end = css.indexOf('\n}', at);
  assert.ok(end > at, ':root is closed');
  return css.slice(at, end);
}

/** Everything outside `:root` and the two blocks that restate it for dark. */
function rules() {
  const root = rootBlock();
  let rest = css.replace(root, '');
  for (const re of [/@media \(prefers-color-scheme: dark\) \{[\s\S]*?\n\}\n/, /:root\[data-theme="dark"\] \{[\s\S]*?\n\}/]) {
    rest = rest.replace(re, '');
  }
  return rest;
}

function declared(prefix) {
  return new Set([...rootBlock().matchAll(new RegExp(`^\\s*(--${prefix}-[\\w-]+):`, 'gm'))].map((m) => m[1]));
}

test('every font size in the stylesheet is a step on the type scale', () => {
  /*
   * The failure this catches is not ugliness, it is a size nobody decided. A
   * raw `13.5px` in a new rule reads in review as a considered choice and is
   * almost never one — it is the size of whatever was copied. Named, the same
   * edit has to answer a question: is this secondary reading, or is it a
   * control? There are only nine answers, and the token says which was given.
   */
  const tokens = declared('type');
  assert.ok(tokens.size >= 8, `the type scale has steps to hold: found ${[...tokens]}`);

  const found = [...rules().matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1].trim());
  assert.ok(found.length > 40, `the stylesheet sets font-size in earnest: found ${found.length}`);
  for (const value of found) {
    const named = value.match(/^var\((--type-[\w-]+)\)$/);
    assert.ok(
      named,
      `font-size: ${value} is a size nobody named. Every one of them is a step on the type `
      + `scale — pick from ${[...tokens].join(', ')}, or add a step and say in `
      + 'docs/design-system.md what it is for.',
    );
    assert.ok(tokens.has(named[1]), `font-size names ${named[1]}, which :root does not declare`);
  }
});

test('every gap in the stylesheet is a step on the spacing scale', () => {
  /*
   * `gap` is the one property in this file that is only ever the distance
   * between two things, which is exactly what the spacing scale is for. The
   * two-value forms count as two: `gap: 4px 14px` was a row rhythm and a column
   * rhythm chosen independently, and one of them was off the ladder.
   */
  const tokens = declared('space');
  assert.ok(tokens.size >= 8, `the spacing scale has steps to hold: found ${[...tokens]}`);

  const found = [...rules().matchAll(/(?:^|[\s;{])(?:row-|column-)?gap:\s*([^;}]+)/g)].map((m) => m[1].trim());
  assert.ok(found.length > 40, `the stylesheet sets gap in earnest: found ${found.length}`);
  for (const value of found) {
    for (const part of value.split(/\s+(?![^(]*\))/)) {
      const named = part.match(/^var\((--space-[\w-]+)\)$/);
      assert.ok(
        named,
        `gap: ${value} spaces by ${part}, which is not a step. The scale is `
        + `${[...tokens].join(', ')} — a distance that fits none of them is a distance `
        + 'worth explaining in docs/design-system.md first.',
      );
      assert.ok(tokens.has(named[1]), `gap names ${named[1]}, which :root does not declare`);
    }
  }
});

test('neither scale carries a step nothing wears', () => {
  /*
   * The other half of the same bargain. A scale that only grows is a palette of
   * near-duplicates again in a few releases, one token at a time — and an
   * unused step is the cheapest possible place for the next near-duplicate to
   * hide, because adding one costs nothing and nobody has to justify it against
   * a step that already exists.
   */
  const body = rules();
  for (const prefix of ['type', 'space']) {
    for (const token of declared(prefix)) {
      assert.ok(
        body.includes(`var(${token})`),
        `${token} is declared and worn by nothing. Either something should be using it, `
        + 'or the scale has a step more than the app has meanings.',
      );
    }
  }
});
