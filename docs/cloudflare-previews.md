# Production and Worker Previews

Finapp uses one static Worker, `siniverse-finapp-site`. Production is published
from `main`; every other branch uses a Worker Preview under that same Worker.
No session API, secret, database or production data binding is added to Previews.
The `previews` block is intentionally empty: assets and the compatibility date
belong at the top level, and the generated browser bundle carries its dev identity.

Use Node 22.12 or later and `npm ci`. Wrangler is pinned to **4.161.0** in the
project and lockfile; Worker Previews requires at least 4.135.0. A newer global
installation does not replace the project dependency.

## Workers Builds settings

After this support is merged and production CI succeeds, configure the existing
Workers Builds project. Leave preview builds disabled until the account plan and
included build/Preview quotas have been checked. This preparation does not enable
them or change a plan.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| Preview command | `npm run preview:cloudflare` |
| Node version | 22.12 or later |
| Enable Preview builds | Enabled after the new commands and quotas are checked |

For a project using the previous preview model, complete the dashboard's
**Set up Worker Previews** step if offered. Cloudflare documents that switch as
one-way. Do not copy production session credentials or backend bindings into
Previews Base.

Publish scripts validate the artifact's branch, checkout SHA and environment
before invoking `npx wrangler deploy` or `npx wrangler preview`. Only `main` can
pass the production guard; `main` cannot use the Preview command. Workers Builds
must supply `WORKERS_CI_BRANCH` and `WORKERS_CI_COMMIT_SHA`, matching the checkout.
The public `deployment.json` records that identity. Stale, wrong-branch and
production/preview-mismatched artifacts are refused. Cache, test and icon checks
still run for both kinds of build.

Wrangler 4.161.0 reads the Preview branch from `WORKERS_CI_BRANCH`, including a
detached CI checkout. Branch `dev` therefore produces a Preview named `dev`.
Other branches and pull requests use their own branch Previews; Workers Builds
can post URLs on pull requests. The Preview command does not deploy production
and does not use `versions upload`.

## Stable custom address

Domains remain managed in the Cloudflare dashboard. `routes` is deliberately
omitted: the repository has no authenticated inventory of all manual domains.
In pinned Wrangler 4.161.0, the standard deploy path does not invoke Custom Domain
replacement when it has no Custom Domains to publish. Do not add a partial
declarative domain list: publishing it can remove other manually configured
domains on the same Worker.

In the existing Worker's **Domains → Custom Domains and Routes**, edit
`finapp.siniverse.cc` and enable **Production and Preview**. A Preview named
`dev` then uses `https://dev.finapp.siniverse.cc/`; other names get sibling
subdomains. `workers_dev: true` and `preview_urls: true` keep `workers.dev` URLs
available as a fallback.

The account also already has the separate Preview-only base domain
`dev.finapp.siniverse.cc`. Preserve that manual domain: its current Preview URLs
are `<preview-name>.dev.finapp.siniverse.cc`, for example
`dev.dev.finapp.siniverse.cc`. The generated dev identity accepts those hosts too.
Enable Preview traffic on the existing parent domain only when the requested
shorter `dev.finapp.siniverse.cc` address is being activated; do not rename or
remove the existing base to obtain it.

Cloudflare provisions wildcard DNS and a certificate for Preview hostnames.
Check existing subdomain conflicts and wait for DNS/certificate activation;
prepared code does not mean the address is live. Do not activate paid
certificate options or another subscription as part of this setup.
Preview URLs are public unless access controls are separately configured.

After the support is on tested `main`, create `dev` from that revision through
the normal repository workflow. The supervising agent can create that reference
when activation is authorized, without directly changing code on `main` or `dev`.
Its first Preview build establishes the stable address. Keep the old GitHub
Pages `/dev/` redirect pointing to working production until the new address has
actually been checked; the separate Pages retirement change retains local recovery.

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

`npm test` checks production/dev/feature identities, revision guards, command
separation, Drive isolation and preview-only headers. GitHub installs the pinned
tool and runs `npx wrangler deploy --dry-run` on a non-published static bundle.
`wrangler preview` has no dry-run flag in 4.161.0: inspect its `--help` and test
the guards instead of creating an actual Preview during preparation.

- [Get started and minimum version](https://developers.cloudflare.com/workers/previews/get-started/)
- [Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/)
- [Custom domains](https://developers.cloudflare.com/workers/previews/custom-domains/)
- [Build branches and the existing-project switch](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
- [Google JavaScript origins](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)
