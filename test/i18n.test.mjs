import test from 'node:test';
import assert from 'node:assert/strict';

import { LANGUAGES, STRINGS, detectLanguage, localeFor, makeTranslator } from '../assets/js/i18n.js';
import { breakingSpaceIn } from './french-spacing.mjs';

test('every language carries exactly the same keys', () => {
  const english = Object.keys(STRINGS.en).sort();
  for (const language of LANGUAGES) {
    assert.deepEqual(Object.keys(STRINGS[language]).sort(), english, `${language} key set`);
  }
});

test('a phrase that takes parameters takes the same ones in every language', () => {
  for (const [key, value] of Object.entries(STRINGS.en)) {
    for (const language of LANGUAGES) {
      const other = STRINGS[language][key];
      assert.equal(typeof other, typeof value, `${language}:${key} shape`);
      if (typeof value === 'function') {
        assert.equal(other.length, value.length, `${language}:${key} parameter count`);
      }
    }
  }
});

test('English agrees with the count; French leaves "mois" alone', () => {
  const en = makeTranslator('en');
  const fr = makeTranslator('fr');
  assert.equal(en('summary.heroLabel', 1), 'Net after 1 month');
  assert.equal(en('summary.heroLabel', 2), 'Net after 2 months');
  assert.equal(en('filter.readoutShort', 1), '1 month');
  assert.equal(fr('filter.readoutShort', 1), '1 mois');
  assert.equal(fr('horizon.years', 1), '1 an');
  assert.equal(fr('horizon.years', 5), '5 ans');
});

test('French sets a no-break space before a colon, a percent sign, and inside guillemets', () => {
  const fr = makeTranslator('fr');
  // Every string, not a list someone has to remember to extend: a phrase that
  // takes parameters is called with stand-ins so its punctuation is read too.
  for (const [key, value] of Object.entries(STRINGS.fr)) {
    const text = typeof value === 'function'
      ? value(...Array.from({ length: value.length }, () => 2))
      : value;
    assert.equal(typeof text, 'string', `${key} should render to a string`);
    // `%` is held to it for the same reason the rest are: French binds it to
    // its figure, and a breaking space lets the two land on separate lines.
    const broken = breakingSpaceIn(text);
    assert.equal(broken, null, `${key} uses a breaking space in "${broken}": ${text}`);
  }
  assert.ok(fr('chart.reading', 'Mois 3', '900').includes(' :'));
  // The reading of a comparison nests one inside the other, so both separators
  // have to be the dictionary's — the inner one was a colon written into the
  // drawing, and a French reader heard the outer one spaced and every inner
  // one not.
  assert.ok(fr('chart.seriesReading', 'Acheter', '900').includes('\u00a0:'));
  assert.equal(makeTranslator('en')('chart.seriesReading', 'Buy', '900'), 'Buy: 900');
});

test('every phrase the page asks for by name is one the dictionary has', async () => {
  // The markup names its phrases as strings, so a mistyped one is invisible
  // until it renders as `update.chekc` in front of a reader — and the fallback
  // that makes an unknown key degrade to itself is what hides it.
  const { readFile } = await import('node:fs/promises');
  const markup = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const asked = [...markup.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(asked.length > 20, 'the page names its phrases by key');
  for (const key of new Set(asked)) {
    assert.ok(key in STRINGS.en, `index.html asks for ${key}, which the dictionary has not got`);
  }
});

test('the English written into the markup is the English the dictionary has', async () => {
  // Every `data-i18n` element carries its phrase inline as well as by key, and
  // nothing held the two together: the inline copy is what shows for the
  // instant before `applyLanguage` runs, and what anyone reading index.html
  // takes the app to say. Seven of them had drifted without a reader ever
  // seeing it — the hint under the fields still described the app as it was
  // before loans and investments existed, the scale note still promised three
  // charts on one scale, three rate labels had lost ", as a percentage", one
  // apostrophe was straight where the dictionary's is typographic, and the
  // button on a shared plan still offered to "Open the shared plan" after that
  // choice became "Add to my plans". Invisible drift is the kind that lasts.
  const { readFile } = await import('node:fs/promises');
  const markup = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const elements = [...markup.matchAll(/<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)];
  // An element this cannot read would be one it silently never checked, so the
  // count is held to the attributes rather than merely to "more than a few".
  const named = markup.match(/\bdata-i18n="/g).length;
  assert.equal(elements.length, named, 'every data-i18n element was read back out of the markup');
  for (const [, , key, inner] of elements) {
    // HTML collapses runs of the four space characters, so a phrase wrapped
    // across lines in the source is still the same phrase. `\s` is the wrong
    // class here: it would eat the no-break spaces French sets, and those are
    // exactly the characters the dictionary is careful about.
    const written = inner.replace(/[\t\n\f\r ]+/g, ' ').trim();
    // An element the app fills in ships empty on purpose, so that it never
    // flashes a phrase it is about to replace; and a phrase that takes
    // parameters has no single spelling to write into the markup at all.
    if (!written || typeof STRINGS.en[key] === 'function') continue;
    assert.equal(written, STRINGS.en[key], `index.html spells ${key} differently from the dictionary`);
  }
});

test('an unknown key degrades to English, then to the key itself', () => {
  const fr = makeTranslator('fr');
  assert.equal(fr('nope.not.here'), 'nope.not.here');
  assert.equal(makeTranslator('xx')('summary.totalIncome'), 'Total income');
});

test('the browser picks the language when the app speaks it', () => {
  assert.equal(detectLanguage({ languages: ['fr-CA', 'en'], language: 'fr-CA' }), 'fr');
  assert.equal(detectLanguage({ languages: ['de-DE'], language: 'de-DE' }), 'en');
  assert.equal(detectLanguage({ languages: [], language: null }), 'en');
});

test('a malformed language tag never reaches Intl', () => {
  assert.equal(localeFor('fr', { languages: ['fr-CA'], language: 'fr-CA' }), 'fr-CA');
  assert.equal(localeFor('fr', { languages: ['fr-FR@posix'], language: 'fr-FR@posix' }), 'fr-FR');
  assert.equal(localeFor('en', { languages: ['en-US@posix'], language: 'en-US@posix' }), 'en-US');
  for (const language of LANGUAGES) {
    assert.doesNotThrow(() => new Intl.NumberFormat(localeFor(language, null)));
  }
});

test('every language points at a manifest, and they agree on app identity', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifests = await Promise.all(LANGUAGES.map(async (language) => {
    const href = makeTranslator(language)('manifest.href');
    const json = JSON.parse(await readFile(new URL(`../${href.replace('./', '')}`, import.meta.url), 'utf8'));
    assert.equal(json.lang, language, `${href} declares its own language`);
    return json;
  }));

  // The French manifest is prose the app ships, so it is held to the same
  // typography as everything else it ships: it is the one French string living
  // outside both the dictionary and the changelog, and until this it was the one
  // nothing read — which is how it came to break the rule.
  const french = manifests[LANGUAGES.indexOf('fr')];
  for (const [key, value] of Object.entries(french)) {
    if (typeof value !== 'string') continue;
    const broken = breakingSpaceIn(value);
    assert.equal(broken, null, `manifest.fr ${key} uses a breaking space in "${broken}": ${value}`);
  }

  // Differing identity would make the browser treat these as two separate apps.
  const [first, ...rest] = manifests;
  for (const manifest of rest) {
    for (const key of ['id', 'start_url', 'scope', 'short_name', 'display', 'theme_color', 'background_color']) {
      assert.deepEqual(manifest[key], first[key], `manifests disagree on ${key}`);
    }
    assert.deepEqual(manifest.icons, first.icons);
    assert.deepEqual(Object.keys(manifest).sort(), Object.keys(first).sort());
  }
});

test('a phrase is looked up on the dictionary itself, never on what it inherits', () => {
  /*
   * A field's `labelKey` and a plan's `nameKey` arrive from a share link and are
   * resolved through `t`. Looked up with `in`, or a bare index, a key of
   * `hasOwnProperty` or `constructor` resolves to a function on
   * Object.prototype and `t` calls it — with no `this`, so it throws, from
   * inside a render, after the plan has already been saved. Reproduced before
   * this test existed: one click on such a link, and the app threw on every
   * boot afterwards with no rows, no hero figure and a language button that
   * did nothing.
   */
  for (const language of LANGUAGES) {
    const t = makeTranslator(language);
    for (const key of ['hasOwnProperty', 'constructor', 'valueOf', 'toString', '__proto__', 'isPrototypeOf', 'toLocaleString']) {
      let out;
      assert.doesNotThrow(() => { out = t(key); }, `${language}: t(${JSON.stringify(key)}) must not throw`);
      assert.equal(typeof out, 'string', `${language}: t(${JSON.stringify(key)}) returned a ${typeof out}`);
      assert.equal(out, key, 'an unknown key comes back as itself, as any unknown key does');
    }
  }
});
