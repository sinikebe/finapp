# Production and Worker Previews

Finapp uses one static Worker, `siniverse-finapp-site`. GitHub Actions publishes
production after a push to `main` and the stable `dev` Preview after a push to
`dev`. Pull requests and default manual runs validate without publishing. An
explicit manual deployment request can publish the current `main` or `dev`.
No session API, secret, database or production data binding is added to Previews.
The `previews` block is intentionally empty: assets and the compatibility date
belong at the top level, and the generated browser bundle carries its dev identity.

Use Node 22.12 or later and `npm ci`. Wrangler is pinned to **4.161.0** in the
project and lockfile; Worker Previews requires at least 4.135.0. A newer global
installation does not replace the project dependency.

## GitHub Actions publication

The `Cloudflare Workers` workflow uses standard `ubuntu-latest` GitHub-hosted
runners, Node 22 and `npm ci`. Actions and Wrangler are pinned. Its `validate`
job runs tests, icon reproducibility, checkout/asset checks and a Wrangler dry
run without Cloudflare credentials. The separate publisher has read-only
repository permissions and receives Cloudflare secrets only in its credential
check and publication step. Build/install steps do not receive those secrets.

| Event | Validation | Publication |
| --- | --- | --- |
| Push to `main` | Exact pushed revision | Production using `npm run deploy:cloudflare` |
| Push to `dev` | Exact pushed revision | Preview `dev` using `npm run preview:cloudflare -- --name dev` |
| Pull request targeting `main` or `dev`, including forks | Merge revision, without secrets | None |
| `workflow_dispatch`, `deploy` left unchecked | Selected revision, without secrets | None |
| `workflow_dispatch`, `deploy` checked on `main` or `dev` | Exact selected revision | Same guarded publisher as the corresponding push |

No pull request code is run through `pull_request_target`. PR Previews are
intentionally not automated, so closing a PR needs no Cloudflare cleanup.
Publication jobs are serialized per target and check that the push still matches
the current remote branch before publishing; a superseded run is skipped. After
publishing, the workflow checks the public `deployment.json` against the exact
expected branch, environment and SHA, allowing time for propagation.

Disable the old Cloudflare Workers Builds production and Preview triggers when
switching publishers, even if GitHub credentials are not ready yet. Keep the
Worker, Preview `dev`, domains, routes, assets and Preview base configuration.
Do not reconnect Git or leave two automatic deployment paths active. Existing
deployments remain online while a missing credential prevents a new publication.

In **GitHub → Settings → Secrets and variables → Actions**, set these repository
secrets through the secure UI or another approved secret-management path:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Account-owned token with Editor access to the existing Finapp Worker, scoped as narrowly as supported |
| `CLOUDFLARE_ACCOUNT_ID` | Existing Worker account; the workflow rejects a different account |

Never paste token values in source, issues, logs or chat. No new Worker or
subscription is needed. Because this workflow does not manage domains or
provision resources, do not add DNS, zone-route or other product permissions just
for this migration. Use the current [Workers authorization guide](https://developers.cloudflare.com/workers/authorization/)
to configure access for the existing Worker and its Previews.

With either secret absent, a push validates and the publisher explicitly reports
**No Cloudflare deployment** in the run summary; an explicit manual deployment
fails clearly. Once both secrets are set, open **GitHub → Actions → Cloudflare
Workers → Run workflow**, select **Branch: main**, check **Publish this validated
main/dev revision to the existing Cloudflare Worker**, then choose **Run
workflow**. Repeat with **Branch: dev** for the stable Preview. No empty commit
is needed. Leave that checkbox unchecked for validation alone. A request on any
other branch validates only and cannot publish. The branch must still point to
the selected SHA before publication; a changed manual request fails and must be
launched again.
GitHub Actions must be enabled and allowed to use the pinned checkout/setup-node
actions. No repository write token, PAT, runner registration or paid service is
required. Keep normal required checks/branch review before merging.

Publish scripts validate the artifact's branch, checkout SHA and environment
before invoking `npx wrangler deploy` or `npx wrangler preview`. Only `main` can
pass the production guard; `main` cannot use the Preview command. The workflow
supplies `WORKERS_CI_BRANCH` and `WORKERS_CI_COMMIT_SHA`, matching the checkout.
The public `deployment.json` records that identity. Stale, wrong-branch and
production/preview-mismatched artifacts are refused. The publication script also
checks GitHub's event, repository, branch, SHA and explicit manual `deploy` input;
a PR or default manual run cannot publish by invoking that script. Cache, test
and icon checks run for both builds.

Wrangler 4.161.0 reads the branch from `WORKERS_CI_BRANCH`, including a detached
CI checkout. Publication also explicitly passes `--name dev` for the stable
Preview. The Preview command does not deploy production or use `versions upload`.

## Stable custom address

Domains remain managed in the Cloudflare dashboard. `routes` is deliberately
omitted so deployment does not replace manually managed domains.
In pinned Wrangler 4.161.0, the standard deploy path does not invoke Custom Domain
replacement when it has no Custom Domains to publish. Do not add a partial
declarative domain list: publishing it can remove other manually configured
domains on the same Worker.

In the existing Worker's **Domains → Custom Domains and Routes**, edit
`finapp.siniverse.cc` and enable **Production and Preview**. A Preview named
`dev` then uses `https://dev.finapp.siniverse.cc/`; other names get sibling
subdomains. `workers_dev: true` and `preview_urls: true` keep `workers.dev` URLs
available as a fallback.

The initial account configuration also had a separate Preview-only base domain
`dev.finapp.siniverse.cc`, producing URLs such as `dev.dev.finapp.siniverse.cc`.
That exact base hostname reserves the address needed by the parent's Preview
named `dev`: keeping both bases produced HTTP 522 on `dev.finapp.siniverse.cc`
even after the parent had Preview traffic enabled. Its wildcard must not be
treated as a compatible second base for the requested short address.

Before activating the short address, inventory the existing domains and Previews
and save their configuration. Detach only the obsolete Preview-only
`dev.finapp.siniverse.cc` base after confirming which Preview URLs it serves.
Keep `finapp.siniverse.cc` enabled for Production and Preview and preserve all
other apps' domains. On initial activation, `dev` was the only Finapp Preview;
no additional build or paid certificate option was needed. The generated dev
identity still accepts the former deeper hostnames, but they are not the stable
address to share.

Cloudflare provisions wildcard DNS and a certificate for Preview hostnames.
Check existing subdomain conflicts and wait for DNS/certificate activation;
prepared code does not mean the address is live. Do not activate paid
certificate options or another subscription as part of this setup.
Preview URLs are public unless access controls are separately configured.

The permanent `dev` branch and stable Preview already exist. Advance that branch
only through the reviewed repository workflow; never overwrite unrelated work.
Keep the old GitHub Pages `/dev/` redirect pointing to production; the separate
Pages retirement artifact retains local recovery and its own publication path.

## Browser data and Google Drive

Every Preview bundle has `environment: dev`, the **Finapp dev** name,
preview-prefixed local storage and the existing development-only Drive namespace.
Browser origins isolate each host's projects and PWA cache; production retains
its original identity. Drive copies stay separate from production. Branch
Previews share the development Drive namespace only when a user explicitly
connects that client and chooses a backup.

The production session client accepts only the exact origin
`https://finapp.siniverse.cc`. It is not enabled on `dev.finapp.siniverse.cc`,
other Preview hosts or `workers.dev`; no production CORS/cookie policy is widened.
Previews use the existing Google Identity Services popup token flow. Temporary
tokens stay in memory, and reopening a tab requires another connection click.

For Drive on the stable dev host, add `https://dev.finapp.siniverse.cc` to
**Authorized JavaScript origins** on the existing preview Web client
`186397627683-4bclnsk16qu9vr8fio5e8vi28lnrj9oj.apps.googleusercontent.com`.
This token flow needs no new server OAuth callback. Other Preview hosts need
their own explicitly authorized JavaScript origins if Drive is desired there.
Local editing and JSON export/restore continue without Google. Never add
production refresh credentials to this static application or a Preview.

Only Preview assets include `X-Robots-Tag: noindex, nofollow` via `_headers`.
Production does not receive this header. The launcher links to working Garapp
production while no Garapp dev hostname has been confirmed active.

## Verification without publication

`npm test` checks production/dev/feature identities, revision and GitHub event
guards, command separation, Drive isolation and preview-only headers. GitHub
installs the pinned tool and runs `npx wrangler deploy --dry-run` on the tested,
non-published bundle.
`wrangler preview` has no dry-run flag in 4.161.0: inspect its `--help` and test
the guards instead of creating an actual Preview during preparation.

- [Get started and minimum version](https://developers.cloudflare.com/workers/previews/get-started/)
- [Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/)
- [Custom domains](https://developers.cloudflare.com/workers/previews/custom-domains/)
- [GitHub Actions authentication](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
- [Google JavaScript origins](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)
