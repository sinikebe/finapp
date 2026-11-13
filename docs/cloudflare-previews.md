# Production and the shared Siniverse pipeline

Finapp uses the existing static Worker `siniverse-finapp-site`:

| Branch | Publication | Address |
| --- | --- | --- |
| `main` | Production | <https://finapp.siniverse.cc/> |
| `dev` | Preview named `dev` on the same Worker | <https://dev.finapp.siniverse.cc/> |

## One CI implementation

`.github/workflows/ci.yml` is the same caller used by all four Siniverse apps.
It references an immutable revision of the reusable workflow in
[`sinikebe/siniverse`](https://github.com/sinikebe/siniverse). Its `uses` SHA and
`automation_ref` must remain identical. Update callers together after reviewing
the shared implementation; do not add another local deployment controller.

The common job uses `ubuntu-24.04`, Node **24.22.2**, npm **11.19.1** and Wrangler
**4.161.0**. `.node-version` and `packageManager` record those local tool versions;
`engines.node` permits compatible Node 24 hosts. It installs through `npm ci`,
checks and builds the selected revision, performs a Wrangler dry run, then uses
that same `dist/` for any authorized publication and public metadata probe.
No persistent Actions cache or uploaded Workers artifact is needed.

Pushes to `main` publish production; pushes to `dev` publish Preview `dev`.
Pull requests, including forks, validate without Cloudflare credentials. Default
manual runs also validate only. An explicit `deploy` request on current `main`
or `dev` uses the same branch, SHA, account and remote-head guards as a push.
No PR code is executed through `pull_request_target` and PR Previews are not
created automatically.

The caller maps only `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` explicitly;
it does not inherit all secrets. The shared controller owns repository/account/
Worker/URL authorization, credential availability, publication and verification.
Secrets are passed only to publication, never to PR checks or app build scripts.
Keep the previous Workers Builds production and Preview automation disabled.
Do not reconnect Git or enable a second automatic publisher.

Repository Actions secrets are configured through the secure GitHub settings UI,
never source, issues, logs or chat. If setup needs validation without a new
commit, open **Actions → CI → Run workflow**, select `main` or `dev`, and enable
the `deploy` input only when publication is intended. Ordinary PR/merge runs are
the normal validation path; avoid redundant manual runs.

## Finapp's two adapters

| Command | App-specific work |
| --- | --- |
| `npm run ci:check` | Business/storage/Drive tests, reproducible icons, and the release-wide PWA cache check |
| `npm run ci:build` | Allowlisted static assets in a new `dist/`, with the requested application identity |
| `npm run ci:pages` | Existing legacy redirect/recovery artifact from the selected main and dev checkouts |

The build consumes `SINIVERSE_BRANCH` (packaging branch `main`/`dev`),
`SINIVERSE_SHA` (the exact checked-out commit) and `SINIVERSE_ENVIRONMENT`
(`production`, `preview` or `test`). The packaging branch selects the existing
`main` or isolated `dev` application identity, including for a PR targeting that
branch. `test` identifies validation without publication; it does not replace the
packaging branch with another variant. PR checks receive no credentials.
Standalone local builds infer the current branch and do not publish anything.

The common controller alone creates `dist/deployment.json`, using its shared
schema and toolchain/artifact metadata. The Finapp adapter does not write a
competing manifest or embed secrets in the browser configuration.

The cache check uses the PR base for a PR, and the release merge-base with `main`
for a development branch, preserving the rule that the cache bump and asset edit
may be separate commits on one branch. On `main`, it uses the common
`SINIVERSE_BASE_SHA` (push-before SHA or tested parent). A change to a precached
file still requires a `CACHE_VERSION` bump, bilingual changelog and stamp.
Infrastructure-only changes do not change the application PWA generation.

## Domains

Domains remain managed in the dashboard. `routes` is deliberately omitted so
Wrangler does not replace manually managed domains with a partial source list.
The parent `finapp.siniverse.cc` serves **Production and Preview**, giving the
Preview named `dev` its short stable address. `workers_dev` and `preview_urls`
are explicitly `false`; this pipeline does not reactivate `workers.dev` URLs.

The former Preview-only base `dev.finapp.siniverse.cc` reserved the same short
hostname and produced HTTP 522 while both bases coexisted. It was detached after
inventorying the existing domains and Previews. Do not re-add that conflicting
base or remove another app's domains. Domain, certificate and account changes
are outside the app adapter; no paid option or new service is needed here.

## Browser data, Google Drive and legacy Pages

Preview bundles retain **Finapp dev**, preview-prefixed browser storage and the
existing development Drive namespace. Production retains its original browser
origin, unprefixed keys, backup namespace and separate session API. No production
session bindings or credentials are added to the static Worker or Preview.
Browser origins isolate local projects and PWA caches.

The production session client accepts only `https://finapp.siniverse.cc`.
The dev host uses the existing Google Identity Services popup token flow with
temporary tokens in memory. For optional Drive access there, add
`https://dev.finapp.siniverse.cc` to **Authorized JavaScript origins** of preview
Web client `186397627683-4bclnsk16qu9vr8fio5e8vi28lnrj9oj.apps.googleusercontent.com`.
No new server OAuth callback is needed. Local editing and JSON export/restore
remain available without Google. The app launcher keeps its existing Garapp
production destination.

Only preview/test bundles add `X-Robots-Tag: noindex, nofollow`; production does
not receive that header. Preview addresses are public unless separately protected.

Finapp and Garapp have identical `Pages` callers for the shared Pages workflow.
Successful same-repository push `CI` on `main` or `dev` triggers it; it requires
successful CI for both current heads before checking out those exact sources.
`ci:pages` receives `SINIVERSE_PAGES_MAIN_SOURCE`, `SINIVERSE_PAGES_DEV_SOURCE`
and `SINIVERSE_PAGES_OUT`; the output must not exist or be inside a source tree.
It retains the existing redirect and retirement scripts, and each branch's
recovery application at its original base.

Pages uses the same Node/npm/runner versions, only the existing GitHub token and
Pages OIDC permissions, and one artifact named for the run/attempt with one-day
retention. A bounded API check requires one unexpired matching artifact and
unchanged source heads immediately before deployment. No Cloudflare secret is
passed. `/finapp/` and `/finapp/dev/` still redirect to production; recovery stays
on the old origin for JSON exports. No localStorage, IndexedDB, cache or Drive
data is deleted or transferred by this CI change.
