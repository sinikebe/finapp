# Contributing

Issues and proposed changes belong in [GitHub](https://github.com/sinikebe/finapp).
Keep financial behavior, migrations and presentation changes independently testable.
Work on a topic branch and open every change PR against `dev`, including docs
and infrastructure.
After review and green CI, agents may merge into `dev` without another user
approval and must verify its deployment. `main` accepts only a PR from this
repository’s `dev`, after the user has tested dev and explicitly approved
production promotion. Do not push code directly to either permanent branch,
merge a feature branch into `main`, or advance `dev` from an untested `main`.

## Run it

CI pins Node 24.22.2, npm 11.19.1 and Wrangler 4.161.0. Compatible Node 24 hosts
can run the checks; the application has no runtime dependencies.

```sh
npm ci             # install the pinned Wrangler development dependency
npm start          # http://127.0.0.1:4173
npm run dev        # same development server; also used by preview tooling
npm test           # all Node tests, including review regressions and storage failures
npm run ci:check    # tests, offline-generation regressions and reproducible icons
npm run ci:build    # static dist/ for the shared pipeline; no publication
npm run ci:pages    # legacy artifact using the three shared Pages source/output variables
npm run icons      # regenerate the icon set
npm run stamp      # refresh the local fallback stamp and source provenance
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
assets/js/finapp-worker-session.js  production session probe and short-lived token client
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
tools/stamp-version.mjs      public version injection and source provenance
tools/build-pages.mjs        allowlisted main + dev Pages artifact
tools/build-legacy-pages.mjs legacy Pages redirects and local recovery application
tools/legacy-pages/          redirect HTML/script and scope-limited retirement worker
tools/build-cloudflare.mjs   allowlisted standalone production or dev artifact
tools/build-cloudflare-worker.mjs  production/Preview bundle and checkout metadata
tools/check-cache-version.mjs automatic version/content proof for the offline cache
tools/ci-pages.mjs           shared Pages source/output adapter for legacy recovery
wrangler.jsonc               static Workers asset configuration
package-lock.json            pinned deployment-tool dependency graph
test/                       Node tests
docs/design-system.md       tokens, layout and accessibility conventions
docs/cloudflare-previews.md production and isolated Worker Preview setup
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

## Releases and public versioning

The shared CI allocates the actual public version from immutable annotated tags
`siniverse-version/main/vX.Y.Z` and
`siniverse-version/dev/vX.Y.Z`. Each channel starts at 0.0.1.
Package/lock 0.0.1 is the local fallback, not a declaration of the deployed release.
Never create a competing app-specific bump workflow or edit version tags.

Use Conventional Commit-style PR titles: `feat:` for a feature,
`fix:` for a fix, and `!` or `BREAKING CHANGE` for a breaking change.
Default merges increment patch; features increment minor; breaking changes
increment major. Exactly one `semver:major`, `semver:minor` or
`semver:patch` label can override classification. Idempotent reruns and
promotion between main/dev are handled centrally.

1. Add new runtime modules to `PRECACHE`.
2. Keep user-facing release notes in both languages and preserve the old cache-label archive.
3. Run `npm run ci:check` for business/storage tests and reproducible icons.
4. Build with `npm run ci:build` and the common environment for integration checks.
5. Verify changed user flows before publication.

The technical source cache baseline v85 is stable. Do not manually increment it
or the public package version for each asset edit. The static build stamps the
same `SINIVERSE_VERSION` into its module, footer and install manifests,
then seals the worker cache with that version and SHA256 of the public content.
The worker identifier is normalized before hashing to avoid a cycle; the
controller's later `deployment.json` and hosting control files are excluded.
The adapter verifies version bindings and the actual worker/content identity
before handing the directory to the common publisher. Regression fixtures reject
stale modules, footers and workers, and require a new cache for changes to either
version or content, including worker logic.

`npm run stamp` only regenerates the committed local fallback stamp from
package.json and source provenance. It never derives the public version from the
cache counter or allocates a new release.

Actions are pinned and CI uses the shared implementation. Configure required
checks and branch protection in GitHub settings; a workflow cannot require its
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

Finapp production uses a dedicated Google OAuth project, whose secret and
refresh credentials belong only to the separate session Worker. The `/dev/`
preview retains its public Web client ID and Google Identity Services, authorized
for `https://sinikebe.github.io`. The browser requests
`https://www.googleapis.com/auth/drive.file` after the reader connects.
Keep app-specific Drive markers and backup namespaces to prevent cross-app
listing or restoration. Keep connection tokens in memory only, without local
storage, IndexedDB, logs or cached assets. Only public app files belong in the service
worker; private Drive responses and backup JSON must never be cached.

An automatic Drive transfer runs only while the user has connected and selected
a backup and local changes have been saved. Production restores the HttpOnly
server session after reopening; only short-lived access tokens live in the
browser's memory. Preview sign-in still requires a click. Keep manual JSON export and
restore available when Google authentication, network access, permissions or
Drive quotas fail. The reader-facing guide is [Google Drive backups](docs/google-drive.md).

## Legacy GitHub Pages publication

Finapp and Garapp use the same `Pages` caller and central orchestration. Successful
push CI on `main` or `dev`, or a manual request, selects both current heads only
after their CI passes. The app's `ci:pages` adapter receives distinct source
directories and a new external output path. Fork PR workflows cannot publish.

Both `https://sinikebe.github.io/finapp/` and its `/dev/` entry point redirect to
`https://finapp.siniverse.cc/`. Shared-plan fragments are retained; unrelated
query parameters are discarded. The destination is fixed HTTPS and the script
only runs on Finapp paths. HTML links remain usable without JavaScript.

The artifact replaces only the old Pages `sw.js` files with retirement workers.
They activate immediately, claim their own scope and unregister themselves,
without deleting caches, localStorage or IndexedDB, or forcing open windows
to navigate. An already installed PWA can show its cached application until
it has received this worker online; a forced refresh may be needed once.
Subsequent navigation goes to the new site. Sibling applications sharing
`sinikebe.github.io` are not changed.

The existing application and assets remain at
`/finapp/recovery.html` and `/finapp/dev/recovery.html` for local recovery.
Each uses the same production or preview storage namespace as before. Open the
corresponding recovery page, download a backup through Tools, and restore it
on the new host. No project data is read by the redirect or sent in a URL.
The new origin cannot read the old origin's local data automatically.
Keep downloaded copies and the old browser data until recovery is complete.

GitHub Pages must use **Settings → Pages → Build and deployment → Source:
GitHub Actions** and keep `https://sinikebe.github.io/finapp/` as its address,
without a custom domain pointing back to Siniverse. The `github-pages`
environment must allow deployments from `main`. After merging and successful
CI, run **Actions → Pages → Run workflow** if a first publication is needed.
The artifact is assembled independently of the Workers build:

```sh
node tools/build-legacy-pages.mjs /path/to/checkout /path/to/new-output
```

The output must be new and outside the source checkout. Only allowlisted app
assets and recovery shells are copied. The source `index.html`, `sw.js` and
Workers bundle are unchanged, so this infrastructure change does not bump the
application's PWA generation. `build-pages.mjs` retains its reusable static
copy/preview helpers for Workers and archived bundles.

## Separate application hosts

Finapp uses the same immutable `CI` caller as the other Siniverse apps, pointing
to one reusable implementation in `sinikebe/siniverse`. It uses `ubuntu-24.04`,
Node 24.22.2, npm 11.19.1 and Wrangler 4.161.0. The existing static Worker is
`siniverse-finapp-site`: a push to `main` publishes production and a push to
`dev` publishes the stable Preview. PRs, including forks, and default manual
runs validate without Cloudflare secrets. Explicit manual publication is limited
to current `main` or `dev` through the same shared guards.
Follow [Production and Worker Previews](docs/cloudflare-previews.md) for current
activation, repository secret names, domains and Google origins. The workflow
uses `npm ci`, then the app's `ci:check` and `ci:build` adapters. Keep old Workers
Builds automation disabled. The check retains business/storage tests, offline-generation regressions and
icon reproducibility; the builder verifies its sealed version/content cache. The adapter emits `dist/` from
the common environment; only the shared controller writes `deployment.json` and
publishes/probes that same artifact. No local publish controller is kept.
Use ordinary PR/merge runs for validation. If manual publication is needed, open
Actions → CI → Run workflow, select `main` or `dev`, and check `deploy`.
Pages redirects use their shared, separate orchestration and are not part of the
Workers artifact. Domains stay dashboard-managed; `workers.dev` and its Preview
URLs remain disabled in Wrangler.

The standalone builder remains available for non-published `main` and `dev`
bundles using a new output directory outside the checkout:

```sh
node tools/build-cloudflare.mjs --branch dev --domain example.test --out /tmp/finapp-dev-site
```

It copies only the static shell and assets, labels a development installation,
retargets suite launcher links, and writes public deployment origins. Never put
secrets in the generated config. The production host retains its original
unprefixed workspace keys and Drive namespace. A future development host has
its own browser origin and preview-prefixed keys; the old Pages recovery
application keeps its original preview namespace. Browser storage cannot cross origins: each
device must export/import its JSON data before an old site is removed. Never
erase a Drive folder or recovery copy as part of a deployment.
