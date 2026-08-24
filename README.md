# Finapp

A small progressive web app that estimates your financial future. List what
comes in and what goes out each month, choose a horizon, and it plots three
cumulative curves — income, expenses and net — over the months ahead.

Everything runs on the device. No build step, no dependencies, no network, no
account. The whole app is static files served from a folder.

*Interface disponible en français : l'application détecte la langue du
navigateur et le bouton **FR / EN** dans l'en-tête permet d'en changer à tout
moment.*

## Run it

```sh
npm start          # static server on http://127.0.0.1:4173
npm test           # unit tests for the projection and the chart scales
npm run icons      # regenerate the icon set from tools/generate-icons.mjs
```

A service worker only registers over `http(s)`, so open the app through the dev
server rather than as a `file://` URL. Any static host works for deployment —
copy the repository contents as-is.

## Fields

**Everything you enter is a field, and every field is the same kind of thing.**
Income and rent are simply the two the app starts with — not special cases, not
privileged code paths. Any field can be renamed, switched between income and
expense, duplicated or deleted, the starting two included. Nothing in the app
reaches for a field by name.

A field is defined once, in [`assets/js/fields.js`](assets/js/fields.js):

```js
{
  id,               // stable, generated
  labelKey,         // dictionary key, while you haven't renamed it
  label,            // your own name; wins over labelKey when set
  direction,        // 'income' | 'expense' — the direction carries the sign
  amount,           // as typed; the projection coerces it to money
  periodMonths,     // 1 monthly · 3 quarterly · 6 half-yearly · 12 yearly
  kind,             // 'plain' | 'loan' | 'investment'
  annualRate,       // % a year: interest on a loan, return on an investment
  termMonths,       // how long a loan runs
}
```

Three details that matter later. **The direction carries the sign**, so amounts
are always positive and no field can smuggle in a negative. **A field keeps its
`labelKey` after you rename it**, so clearing the name box hands it back its
translated default rather than leaving it nameless. And **a period is a count of
months, not a name**, so the projection can do arithmetic with it and a new one
— every two years, say — is a number in `PERIODS` plus a dictionary entry.

### What a field can be

- **Amount** — the default. It lands, unchanged, every period.
- **Loan** — you enter what was borrowed, the yearly interest rate and the
  number of monthly payments; the app works out the level repayment (the
  standard amortisation formula) and charges it every month until the term
  runs out. The row says what it worked out to, interest included. A loan
  points either way: outgoing when you repay one, incoming when you are repaid.
- **Investment** — you enter what goes in, how often, and the yearly return.
  The contributions leave your cash like any other outgoing, and the balance
  compounds monthly: growth first, then the month's contribution, because money
  paid in today has not had time to earn yet. Each balance is tracked
  separately, so two investments can carry different rates.

Two invariants belong to the model rather than the form, so a hand-edited store
can't break them: an investment is always money going out, and a loan always
repays monthly whatever period is stored against it.

### How often an amount lands

A field lands at the end of each of its periods: a yearly amount at months 12,
24, 36; a quarterly one at 3, 6, 9. The projection shows money moving when it
actually moves, so a lumpy year reads as a staircase rather than a smooth line
that never matches anyone's bank balance — and a total is the amount times the
number of times it actually landed, never a part-payment.

Because of that there is no single "per month" figure once a yearly bill is in
the list, so the summary reports the **average over the horizon**. With only
monthly fields that average is exactly the monthly figure, so nothing reads
differently until you give something a longer period.

## What it computes

The model lives in [`assets/js/projection.js`](assets/js/projection.js) and is
deliberately the simplest thing that is honest:

```
contribution(f, m) = loan      → m ≤ f.termMonths ? payment(f) : 0
                     otherwise → m % f.periodMonths === 0 ? f.amount : 0
income(m)          = income(m−1)   + Σ contribution(income fields, m)
expenses(m)        = expenses(m−1) + Σ contribution(expense fields, m)
net(m)             = income(m) − expenses(m)
invested(m)        = Σ over investments of
                       balance(f, m−1) × (1 + f.annualRate/12) + contribution(f, m)
```

for `m = 0 … X`, where month 0 is today — nothing earned, nothing paid. The
series are accumulated month by month rather than multiplied, which is what lets
a field's contribution vary over time: **`contributionOf(field, month)` is the
one function that decides what a field moves in a given month**, and periods
were added by teaching it a single rule. Amounts are rounded to whole cents at
every step, so what you read is what adds up.
Input is coerced rather than trusted: a negative or unparseable amount becomes
`0`, the horizon is clamped to 1–600 months, and both a single field and the sum
of a direction are capped where doubles stop counting cents exactly.

Amounts carry no currency symbol. The app never asks which currency you use, so
it never claims to know.

## The charts

Three single-series line charts, hand-drawn as SVG in
[`assets/js/chart.js`](assets/js/chart.js):

- **One shared vertical scale** across all three cards, so the curves can be
  read against each other. Two y-scales on one plot would invent a correlation
  that isn't in the data; three cards on one scale don't.
- **Series colours** are slots 1–3 of a validated categorical palette (blue,
  orange, aqua). They clear the colour-blind and normal-vision separation floors
  in both light and dark mode.
- **Nothing is gated behind hover.** The endpoint is labelled directly, a
  crosshair tooltip follows the pointer (and the arrow keys — `Shift` jumps a
  year, `Home`/`End` jump to the ends), hovering one chart moves all three, and
  every card has a table view with the exact monthly figures.
- **Dark mode is a selected palette**, not an inverted one.

## Layout

```
index.html                 markup + i18n hooks (data-i18n)
manifest.webmanifest       installability (manifest.fr.webmanifest: the same
                           app, named in French)
sw.js                      offline shell
assets/css/app.css         design tokens (light + dark), shell, chart chrome
assets/js/fields.js        the field model — shape, coercion, operations
assets/js/projection.js    fields + horizon → the cumulative series
assets/js/field-list.js    the editable list of fields
assets/js/chart.js         the SVG line chart
assets/js/format.js        locale-aware number formatting
assets/js/i18n.js          English and French copy
assets/js/app.js           wiring: inputs, state, theme, language, install, updates
tools/generate-icons.mjs   icon set, rendered from a vector description
tools/serve.mjs            development server (never deployed)
test/                      node:test unit tests
```

## Offline and updates

`sw.js` treats its cache as one immutable generation: the page, the CSS and the
JS are precached together on install and served together from that same
generation. Nothing is refreshed behind the app's back, so you never get a fresh
page wired to stale scripts — the failure mode of an unhashed static app that
mixes network-first HTML with cached assets.

A new version therefore arrives whole. A new worker installs its own cache
alongside the running one, and the app offers a **Reload** button rather than
swapping the page out mid-edit; accepting it activates the new worker, drops the
old cache, and reloads. Declining it changes nothing until the next visit.

**Bump `CACHE_VERSION` in `sw.js` whenever a precached file changes.** That is
the one manual step in the whole project — there is no build to do it for you,
and browsers only look for a new worker when `sw.js` itself changes. CI fails
the build if a precached file moves without it.

## Languages

The interface ships in English and French. On first load the app picks the
browser's language if it speaks it; the header toggle overrides that and the
choice is remembered. Number formatting follows the same choice — `72,000` in
English, `72 000` in French.

A manifest has no per-language strings, so there is one per language and the app
points `<link rel="manifest">` at the right one — that is what names the app in
the install prompt. Both declare the same `id`, `start_url` and `scope`, so it
stays one installed app; the tests enforce that.

To add a language, add a block to `STRINGS` in
[`assets/js/i18n.js`](assets/js/i18n.js) (the English block is the key list to
match) and add its code to `LANGUAGES`. Static markup is translated through
`data-i18n` attributes; anything dynamic goes through the same dictionary —
including punctuation that differs between languages, such as the no-break space
French sets before a colon. The tests check that every language carries the same
keys with the same parameters, so a half-translated release fails the build.

## Your data

Three keys in `localStorage`, on your device only: `finapp.state.v2` (your
fields and horizon), `finapp.theme.v1` and `finapp.language.v1`. A store written
before fields existed (`finapp.inputs.v1`, a lone income and rent) is carried
over on first load and then retired, so nobody loses what they had typed.
Nothing is sent anywhere — the app makes no network requests after loading its
own files.

## Extending it

The point of the field model is that the common kind of growth — *more things to
track* — costs nothing: that is what the "Add a field" button already does, and
the projection sums whatever it is given.

**Giving fields a new attribute** (a start month, an end month, a growth rate, a
category) is the next-cheapest kind of change, and it has one seam. Periods went
in this way — a schema entry, a rule in `contributionOf`, one control — so the
steps below are a description of a change that has actually been made, not a
hope:

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
point in `project()` plus one entry in the `CHARTS` list in `app.js`. The chart
component takes any `{month, value}` series and needs no changes — the
investment-value card was added exactly that way, with two flags on its entry:
`onlyWithInvestments` to draw it only when it has something to say, and
`ownScale` because a balance is not a cumulative flow and flattens to nothing on
the flows' shared axis.

**A new kind of field** (a mortgage with an offset, a pension with employer
matching) is an entry in `KINDS`, a branch in `contributionOf`, the controls it
needs in `createRow`, and which of them to show in `syncRow`.

**A new language** is a block in `i18n.js`; the tests fail if it is missing a
key that another language has.

Two habits keep this cheap: model operations are pure and return new lists, so
state changes stay traceable; and the list UI reconciles rows in place rather
than re-rendering, so nothing you add can start stealing focus mid-edit.

## Browser support

Any browser with ES modules, `Intl.NumberFormat`, CSS custom properties and
`ResizeObserver` — Chrome/Edge 88+, Firefox 89+, Safari 15+. Installability
depends on the browser: Chromium prompts, Safari installs through *Add to Home
Screen*. The app degrades to a plain page if service workers are unavailable.
