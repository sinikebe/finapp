# Contributing

Issues and proposed changes belong in [GitHub](https://github.com/sinikebe/finapp).
Keep financial behavior, migrations and presentation changes independently testable.
Work on `dev` or a topic branch; publishing the default branch is a separate step.

## Run it

Node 20 or later; no build step and no runtime dependencies.

```sh
npm start          # http://127.0.0.1:4173
npm run dev        # same development server; also used by preview tooling
npm test           # all Node tests, including review regressions and storage failures
npm run build:cloudflare # tested production artifact for Git-connected Pages
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
assets/js/car-energy.js       dated car specifications, budgets and example builder
assets/js/example-context.js  original example assumptions and source disclosure
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
assets/js/input-validation.js numeric drafts, currency affixes and inline validity
assets/js/save-controller.js  debounced saves, reverts and queued-write coordination
assets/js/deployment.js       production/preview storage and lock namespaces
assets/js/deployment-config.js  legacy path defaults and generated hosting environment
assets/js/backup.js           bounded backup validation and restore summaries
assets/js/legacy-rescue.js    read-only migration of old-origin rescue files
assets/js/backup-merge.js     differences and validated field-level backup merge
assets/js/finapp-drive-config.js  public OAuth client IDs for main and preview
assets/js/finapp-drive-auth.js    Google Identity Services authorization
assets/js/finapp-drive-api.js     private Drive file transport and errors
assets/js/finapp-drive-format.js  snapshot validation, hashes and revision graph
assets/js/finapp-drive-sync.js    versioned synchronization and conflict resolution
assets/js/finapp-drive-panel.js   connection, history and comparison controls
assets/css/drive.css          responsive Drive backup controls
assets/js/interface.js        presentation preferences and guided blank projects
assets/js/interface-view.js   mode controls, summary/comparison and backup preview
assets/js/workspace.js        presentation preferences, scenario amount and mileage commands
assets/js/workspace-view.js   Horizon, Atelier and Parcours navigation and live recap
assets/js/workspace-cards.js  shared comparison cards and validated inline editing
assets/js/browser-tools.js    quick actions, native files/sharing, CSV and backup drop
assets/js/help.js             accessible contextual explanations and bounded panels
assets/css/help.css           information controls, help panels and touch targets
assets/css/workspace.css      responsive workspace arrangements, controls and printing
assets/css/finapps-ui.css     versioned finapps palettes and outline icon primitives
assets/js/app.js              controller and view composition
assets/js/app-switcher.js    Shared Finapp/Garapp launcher and environment-aware links
tools/generate-icons.mjs     dependency-free icon generation
tools/serve.mjs              local development server
tools/stamp-version.mjs      cache/build metadata
tools/build-pages.mjs        allowlisted main + dev Pages artifact
tools/build-cloudflare.mjs   allowlisted standalone production or dev artifact
tools/build-cloudflare-pages.mjs  gated production artifact for Git-connected Pages
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

## Simple and Advanced

Simple is the initial presentation. `finapp.viewMode.v1` is a device preference;
changing it does not edit a financial field, identity, target, assumption or
shared link. Advanced controls that affect a Simple result have a readable
summary and an action that opens the relevant field. Keep comparison, cash
warnings and save/recovery actions available in both views.

`input-validation.js` owns incomplete or invalid DOM drafts. It sends commands
only for valid entries. Reconciliation and blur must not clear an invalid draft
or turn it into zero; the last valid model value remains in the results.

Backup restoration validates every project before showing a replacement action.
It creates an independent recovery draft before replacement, checks the current
saved revision and uses the same atomic store as ordinary edits. Never replace
anything when validation or recovery storage fails.

Drive synchronization uses the existing version 1 backup workspace. Validate the
raw remote snapshot and its hash before parsing or normalizing it, and pass any
replacement or merge through the same local revision check and recovery copy as
JSON restoration. Keep remote versions immutable. Never resolve concurrent
changes or project deletions by silently overwriting a device; the reader must
review the differences and choose what to retain. Tests should exercise two
devices, a changed local revision during transfer, corrupt remote files, failed
recovery storage and restoration of a historical JSON backup.

Finapp production uses a dedicated Google OAuth project and a public Web client
ID authorized for `https://finapp.siniverse.cc`. The `/dev/` preview retains its
previous client, authorized for `https://sinikebe.github.io`. Do not add a client
secret. Google Identity Services requests
`https://www.googleapis.com/auth/drive.file` after the reader connects.
Keep app-specific Drive markers and backup namespaces to prevent cross-app
listing or restoration. Keep connection tokens in memory only, without local storage,
IndexedDB, logs or cached assets. Only public app files belong in the service
worker; private Drive responses and backup JSON must never be cached.

An automatic Drive transfer runs only while the user has connected and selected
a backup and local changes have been saved. A closed tab loses its access token;
the next session requires a manual connection. Keep manual JSON export and
restore available when Google authentication, network access, permissions or
Drive quotas fail. The reader-facing guide is [Google Drive backups](docs/google-drive.md).

## Production and development publication

The `Pages` workflow, installed on `main`, reacts to successful push CI on
`main` and `dev`. It chooses the latest successful push-CI commit of each branch,
checks out those exact revisions and assembles one static artifact. Production
is at the existing root URL; development is at `/dev/`. A later failing commit
is never substituted for the revision CI actually tested. Fork PR workflows
cannot trigger publication.

The assembler labels both development manifests **Finapp dev**, including their
short names, and writes the same development name into the static page title
and Apple home-screen metadata. Production files are copied unchanged. Runtime
language changes keep the development label. Manifest IDs, launch URLs, scopes
and icon paths remain relative and unchanged, preserving existing installations
and their data.

GitHub Pages must use **Settings → Pages → Build and deployment → Source:
GitHub Actions**. If it still uses a branch, the workflow uploads the combined
artifact and explains the setting in its summary, without changing the existing
publication. After changing the source, run **Actions → Pages → Run workflow**.
The `github-pages` environment can keep allowing deployments from `main`:
`workflow_run` and manual runs of this central workflow run from that branch.

The preview uses `finapp-preview:/finapp/dev/:…` local-storage keys and a separate
Web Lock. Production retains existing keys. Service-worker cache names include
their scope and use `finapp@…` rather than the legacy `finapp-` prefix, so an older
production worker cannot delete preview caches. Relative manifests and assets
keep installations and offline navigation inside their own scope. These are
same-origin namespaces, not a security boundary; use a separate origin if dev
code must be untrusted.

To assemble an artifact locally after preparing both checkouts:

```sh
node tools/build-pages.mjs /path/to/main /path/to/dev /path/to/new-output
```

The output directory must not exist and must be outside both source checkouts.
Only the static shell and assets are copied; Git metadata, tests and workspace
files are excluded. Symlinks and a preview without the isolation modules are
rejected.

## Separate application hosts

On Cloudflare Pages, build `main` and `dev` separately, with each branch at the
root of its own HTTPS host. Package a tested checkout with a domain chosen by
the owner:

```sh
node tools/build-cloudflare.mjs --branch dev --domain example.fr --out /tmp/finapp-dev-site
```

For the Git-connected production project, grant Cloudflare Pages access to this
repository and use `main` as its production branch. Set the framework preset to
None, the build command to `npm run build:cloudflare`, the output directory to
`dist`, and `NODE_VERSION=22`. Set preview branch deployments to None: this
project intentionally publishes only production. The build runs the test suite,
checks icon reproducibility and the service-worker cache version, then prepares
the static artifact for `finapp.siniverse.cc`. It stops if it cannot inspect
the previous revision. Leave `CLOUDFLARE_DEPLOY_ENABLED` unset so the older
Direct Upload job cannot publish a second deployment.

The standalone command above requires a new output directory outside the checkout.
Both build paths copy only
the static shell and assets, labels the development installation, retargets
the HTML launcher links, and writes a public `assets/js/deployment-config.js` listing the environment and companion
Finapp/Garapp origins. No secrets belong in that file. The committed config
keeps the legacy GitHub Pages `/dev/` detection until the move is complete.

Production keeps the original unprefixed local workspace key. A new development
host has its own origin and still uses preview-prefixed keys; it cannot silently
read the production workspace when served at `/`. Drive keeps the original
production and development namespace IDs so the existing folders and immutable
versions are discoverable on the new hosts. Browser storage cannot cross
origins: each device must export/import its JSON data, or use a tested recovery
bridge on the old origin, before the old site is unpublished. Never erase an old
Drive folder or local recovery copy as part of the deployment.
