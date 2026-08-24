import test from 'node:test';
import assert from 'node:assert/strict';

import { LANGUAGES, STRINGS, detectLanguage, localeFor, makeTranslator } from '../assets/js/i18n.js';

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

test('French sets a no-break space before a colon', () => {
  const fr = makeTranslator('fr');
  for (const key of ['theme.aria.light', 'lang.aria', 'charts.scaleNote']) {
    const text = fr(key);
    assert.ok(!/[^\s  ] :/.test(text), `${key} uses a breaking space: ${text}`);
  }
  assert.ok(fr('chart.reading', 'Mois 3', '900').includes(' :'));
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
