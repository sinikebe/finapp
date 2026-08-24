# Finapp

A small progressive web app that estimates your financial future. Enter what you
earn and what you pay in rent each month, choose a horizon, and it plots three
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

## What it computes

The model lives in [`assets/js/projection.js`](assets/js/projection.js) and is
deliberately the simplest thing that is honest:

```
income(m)   = monthlyIncome × m
expenses(m) = monthlyRent   × m
net(m)      = income(m) − expenses(m)
```

for `m = 0 … X`, where month 0 is today — nothing earned, nothing paid. Amounts
are rounded to whole cents at every step, so what you read is what adds up.
Inputs are coerced rather than trusted: a negative or unparseable amount becomes
`0`, and the horizon is clamped to 1–600 months.

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
manifest.webmanifest       installability
sw.js                      offline shell
assets/css/app.css         design tokens (light + dark), shell, chart chrome
assets/js/projection.js    the money model — pure, tested
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

To add a language, add a block to `STRINGS` in
[`assets/js/i18n.js`](assets/js/i18n.js) (the English block is the key list to
match) and add its code to `LANGUAGES`. Static markup is translated through
`data-i18n` attributes; anything dynamic goes through the same dictionary.

## Your data

Three keys in `localStorage`, on your device only:
`finapp.inputs.v1`, `finapp.theme.v1`, `finapp.language.v1`. Nothing is sent
anywhere — the app makes no network requests after loading its own files.

## Extending it

The projection is the seam. `project()` already returns a per-month array, so a
second expense, a savings balance or an annual raise means adding a field to its
input, a term to the loop, and — if it deserves its own card — one more entry in
the `CHARTS` list in `app.js`. The charts take any `{month, value}` series.

## Browser support

Any browser with ES modules, `Intl.NumberFormat`, CSS custom properties and
`ResizeObserver` — Chrome/Edge 88+, Firefox 89+, Safari 15+. Installability
depends on the browser: Chromium prompts, Safari installs through *Add to Home
Screen*. The app degrades to a plain page if service workers are unavailable.
