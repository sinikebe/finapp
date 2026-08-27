# Contributing

## Run it

```sh
npm start          # static server on http://127.0.0.1:4173
npm test           # unit tests for the models, the projection, the scales
npm run icons      # regenerate the icon set from tools/generate-icons.mjs
npm run stamp      # rewrite assets/js/version.js from sw.js and the checkout
```

There is no build step and there are no dependencies: the repository *is* what
gets served, and any static host works — copy the contents as they stand. A
service worker only registers over `http(s)`, so open the app through the dev
server rather than as a `file://` URL.

## The two manual steps

**Bump `CACHE_VERSION` in `sw.js` whenever a precached file changes, then run
`npm run stamp`.** Those two are the whole project's manual steps — there is no
build to do either for you, and browsers only look for a new worker when
`sw.js` itself changes. CI fails the build if a precached file moves without
the bump, and a test fails if the stamp names a different version than the
worker serves.

The stamp records what is knowable rather than what would be nice. There is no
build step, so nothing runs at deploy time to write a hash in, and a commit
cannot contain its own hash — under squash merges the branch commit does not
even survive into `main`. So `npm run stamp` writes the version, the branch and
the commit the working tree sits on top of, and the About panel says **built
from**, which is the true statement. Every released version in the changelog
carries the commit it was merged as, which is exact, because that is history;
the newest entry has none until the merge that publishes it creates one, and
the panel says *not yet released* in the meantime. A test allows that for the
newest entry and no other.

The changelog lives in [`assets/js/changelog.js`](assets/js/changelog.js) and
keeps both languages side by side rather than in the dictionary: it grows one
entry per release and the two readings of an entry are written together, so
splitting them would only let them drift.

## Layout

```
index.html                 markup + i18n hooks (data-i18n)
manifest.webmanifest       installability (manifest.fr.webmanifest: the same
                           app, named in French)
sw.js                      offline shell
assets/css/app.css         design tokens (light + dark), shell, chart chrome
assets/js/fields.js        the field model — shape, coercion, operations
assets/js/strategies.js    the strategy model — a named set of fields
assets/js/projection.js    fields + horizon → the cumulative series
assets/js/field-list.js    the editable list of fields
assets/js/strategy-bar.js  the tabs that name, switch and add strategies
assets/js/chart.js         the SVG line chart, one or many series
assets/js/sankey.js        the flow diagram: in, pooled, out
assets/js/dom.js           the two DOM helpers the views share
assets/js/format.js        locale-aware number formatting
assets/js/i18n.js          English and French copy
assets/js/changelog.js     what changed, release by release, in both languages
assets/js/version.js       the build stamp the About panel reads (generated)
assets/js/app.js           wiring: inputs, state, theme, language, install, updates
tools/generate-icons.mjs   icon set, rendered from a vector description
tools/serve.mjs            development server (never deployed)
tools/stamp-version.mjs    writes version.js from sw.js and the git checkout
test/                      node:test unit tests
docs/                      the screenshots the README shows
```

## Extending it

The point of the field model is that the common kind of growth — *more things
to track* — costs nothing: that is what the "Add a field" button already does,
and the projection sums whatever it is given.

**Giving fields a new attribute** (a start month, an end month, a category) is
the next-cheapest kind of change, and it has one seam. Periods went in this way
— a schema entry, a rule in `contributionOf`, one control — so the steps below
describe a change that has actually been made, not a hope:

1. Add an entry to `FIELD_SCHEMA` in `fields.js` — a default and how to read
   whatever turns up in its place. That is the whole edit: normalisation,
   storage, migration, duplication and the list's reconciliation all read the
   schema rather than naming keys of their own.
2. Give it meaning in `contributionOf()` in `projection.js` — the one function
   that decides what a field moves in a given month.
3. If it needs a control: build it in `createRow`, sync it in `syncRow`, and
   send its edits through the existing command stream — plus its label in
   `i18n.js` and one line in `fieldLabels()` in `app.js`, since the list owns no
   English of its own. The row is a wrapping flex line, so no layout change.

This was measured, not assumed: adding a per-field start month took six edits
across exactly those three files, and duplication, storage round-trips and the
v1 migration carried the new attribute with no changes at all.

**A new derived series** (savings, taxes, a running balance) is a key on each
point in `project()` plus one entry in the `CHARTS` list in `app.js` — and, if
it belongs in the comparison, one more in `METRICS`. The chart component takes
any `{month, value}` series and needs no changes: the investment-value card was
added exactly that way, with two flags on its entry, `onlyWithInvestments` and
`ownScale`. The total came the same way and cost a line in `project()`, an
entry in each list, and a colour — the colour being the only part that took
real work.

**A new kind of field** (a mortgage with an offset, a pension with employer
matching) is an entry in `KINDS`, a branch in `contributionOf`, the controls it
needs in `createRow`, and which of them to show in `syncRow`. A kind that holds
a balance rather than moving cash — the way *something you own* does — adds its
running total to the loop in `project()` and returns `0` from `contributionOf`.

**Something a strategy carries** (a note, a start date, a colour of its own) is
the same shape one level up: `strategies.js` owns the shape and the operations,
`app.js` owns the storage version and the migration into it, and the comparison
view reads whatever `project()` returns.

**A new language** is a block in `STRINGS` in
[`assets/js/i18n.js`](assets/js/i18n.js) — the English block is the key list to
match — plus its code in `LANGUAGES` and a manifest of its own, since a
manifest has no per-language strings. All the manifests declare the same `id`,
`start_url` and `scope`, so it stays one installed app. Static markup is
translated through `data-i18n` attributes and anything dynamic goes through the
same dictionary, punctuation included: the no-break space French sets before a
colon, and inside a pair of guillemets, is a dictionary concern and lives in
[`test/french-spacing.mjs`](test/french-spacing.mjs), in one place because
three files are held to it. The tests fail if a language is missing a key that
another has, or carries different parameters for one.

Two habits keep all of this cheap: model operations are pure and return new
lists, so state changes stay traceable; and the list UI reconciles rows in
place rather than re-rendering, so nothing you add can start stealing focus
mid-edit.

## Tests

`npm test` runs `node --test` over `test/*.test.mjs` — no runner, no
dependencies. CI additionally regenerates the icons and fails if they differ
from what is committed, and checks the `CACHE_VERSION` bump described above.
