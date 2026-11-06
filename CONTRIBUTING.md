# Contributing

Issues and proposed changes belong in [GitHub](https://github.com/sinikebe/finapp).
Keep financial behavior, migrations and presentation changes independently testable.
Work on `dev` or a topic branch; publishing the default branch is a separate step.

## Run it

Node 20 or later; no build step and no runtime dependencies.

```sh
npm start          # http://127.0.0.1:4173
npm test           # all Node tests, including review regressions and storage failures
npm run icons      # regenerate the icon set
npm run stamp      # update the version stamp after changing the cache version
```

Use HTTPS or localhost for the browser APIs used by saving and the PWA. A
`file://` copy is not a supported way to run ES modules or service workers.

## Layout

```text
index.html                   shell, accessible regions, dialogs, CSP and i18n hooks
manifest.webmanifest         English PWA manifest
manifest.fr.webmanifest      French PWA manifest
sw.js                        versioned offline shell
assets/css/app.css           tokens and responsive layout
assets/js/numbers.js          bounded numeric input, percentages, amounts and months
assets/js/fields.js           field schema and pure operations
assets/js/strategies.js       strategies, shared identity and defaults
assets/js/projects.js         project boundaries and switching operations
assets/js/templates.js        example projects and old-template identity repair
assets/js/state.js            pure workspace defaults, migration and snapshot shape
assets/js/store.js            atomic persistence, revision checks and recovery drafts
assets/js/plan-operations.js  target dependency checks and shared-plan merging
assets/js/scenarios.js        original fields -> schedule -> financial projection
assets/js/projection.js       financial arithmetic and derived series
assets/js/schedule.js         target-dependent dates and cycle detection
assets/js/milestones.js       target schema and readings
assets/js/solve.js            backward search and verification on complete inputs
assets/js/history.js          bounded, project-scoped undo
assets/js/share.js            bounded versioned URL format and identity remapping
assets/js/field-labels.js     read-only field descriptions and financial summaries
assets/js/field-list.js       field controls, reconciliation and commands
assets/js/milestone-list.js   target controls and dependency feedback
assets/js/project-switch.js  project selector and list
assets/js/strategy-bar.js    strategy selectors
assets/js/chart.js           SVG charts and exact-value tables
assets/js/sankey.js          conserving flow diagram and table
assets/js/dom.js              shared DOM helpers
assets/js/format.js           locale-aware formatting
assets/js/i18n.js             English/French copy
assets/js/changelog.js        release history in both languages
assets/js/version.js          generated build stamp
assets/js/app.js              controller and view composition
tools/generate-icons.mjs     dependency-free icon generation
tools/serve.mjs              local development server
tools/stamp-version.mjs      cache/build metadata
test/                       Node tests
docs/design-system.md       tokens, layout and accessibility conventions
```

## Model and view boundaries

- `fields`, `strategies`, `projects`, `milestones` and `plan-operations` are pure
  operations. Views send commands; rendering does not repair or mutate state.
- Keep original fields distinct from scheduled fields. The solver and the
  return range start from originals and resolve their own dates. Only the
  sensitivity ranking deliberately freezes already resolved dates.
- Shared fields keep the same ID within a project. A new project gets new IDs.
- Target references must name a target in the same project. A used target
  cannot be removed; the controls explain how to detach it first. Appending
  shared plans merges/remaps targets instead of replacing existing targets.
- Use `numbers.js` consistently. Amount grouping differs from rate syntax;
  rates may have negative values and more than two fractional digits.
- Translate user-facing text through `i18n.js`, including status and error text.
  Keep French nonbreaking punctuation and parameter lists consistent.

## Persistence contract

`finapp.workspace.v1` holds a complete workspace in a single `setItem` write.
The record contains the flat active plan, the shelf, a revision and the previous
legacy-mirror values. One write succeeds or leaves the previous workspace intact.

`finapp.state.v3` and `finapp.projects.v1` are compatibility mirrors. They are
written only after the authoritative save. A failed mirror write cannot lose a
project. A legacy build changing a mirror is recognized on the next read, with
the canonical open project parked before the foreign plan is adopted.

Web Locks serialize read/compare/write across current tabs. Every save checks
its expected revision under that lock. A stale save returns a conflict and
leaves both the saved version and the open draft intact. Never resolve a conflict
by silently overwriting the other tab or discarding the local draft.

Each tab stages a complete draft under its own `finapp.draft.v1.*` key before
waiting for its save. It is removed only if that same draft was saved; an older
queued save must not delete a newer staged edit. Unfinished drafts can be
recovered or exported later. These recovery drafts are distinct from undo,
which is still kept only in memory.

Preferences have separate keys. Failed storage access must result in visible
feedback and an export path, not a claim that changes were saved.

## Share format

Version 2 keeps the sparse field layout in `WIRE_KEYS` and adds target names
and target slots to the target tuples. Field identity and target identity are
remapped into independent fresh IDs. Keep `WIRE_KEYS` append-only.

Read legacy version 1 links when they can be reconstructed. Conditional v1
links omitted their target identities and cannot safely be guessed. Refuse
missing references rather than quietly changing the resulting projection.

Bound the encoded input before decoding and bound lists before mapping them.
Numeric strings are bounded separately. Never render imported values as HTML.

## Validation

`npm test` covers arithmetic, defaults, templates, identity, target dependencies,
share round trips, conditional solver/range runs, failed writes, legacy migration,
concurrent saves, recovery drafts, i18n and layout constraints.

Use behavior checks for integration contracts. A source-text assertion is useful
for a structural property, but it is not evidence that a user interaction works.
When a financial result changes, verify its monthly cash movements independently
before changing a fixture to match it.

Browser validation should include: keyboard traversal of target names; editing
shared rows in both templates; sharing conditional start/end/sale dates; applying
a solved figure back to the original plan; background-tab updates; closing during
a pending save; retry/recovery/export; both locales; mobile layout; and service
worker installation, updates and offline loading.

## Release

1. Bump `CACHE_VERSION` in `sw.js` when a precached asset changes.
2. Add every new runtime module to `PRECACHE`.
3. Update both languages in `changelog.js`, then run `npm run stamp`.
4. Run `npm test`, regenerate icons and verify there is no icon diff.
5. Complete browser checks for the changed flows before publishing.

CI also checks the cache bump and icon reproducibility. Actions are pinned to
commit hashes and run with read-only repository permissions. Configure required
checks/branch protection in repository settings; a workflow cannot require its
own success before merging.

## Financial scope

The model uses nominal annual balance rates divided by twelve. Investment tax
changes the displayed net-profit figure, not cash or total worth, even on sale;
those remain before tax and are labeled accordingly. Housing-template taxes are
fixed example fields. Changes to these conventions need explicit product copy,
independent arithmetic tests and updated worked examples.
