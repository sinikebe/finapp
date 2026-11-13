# Cloudflare Workers hosting

Finapp publishes static assets through a **Workers Builds** project connected to
GitHub. The site Worker and the Google Drive session API are separate projects.
Project files go directly from the browser to Google Drive; the session API
does not receive backups. The production site remains at
`https://finapp.siniverse.cc/`, preserving its browser storage and PWA origin.

## Production setup

1. Connect the Finapp repository to **Workers Builds** in the Cloudflare
   dashboard. Use `main` as the production branch and name the Worker
   `siniverse-finapp-site`, matching `wrangler.jsonc`.
2. Set the build command to `npm run build:cloudflare` and the deploy command to
   `npx wrangler deploy`. Use Node.js 22. The build tests the complete codebase,
   checks reproducible icons and the service worker cache generation, and
   creates `dist/`. `wrangler.jsonc` serves that directory at the site root;
   the first deploy exposes a `workers.dev` preview for checking the bundle.
   No GitHub Cloudflare deployment token or GitHub Actions publisher is needed.
   The build also checks Cloudflare's `WORKERS_CI_BRANCH` and commit SHA so a
   preview branch or different revision cannot publish this production Worker.
3. Configure the separate session Worker at `https://api.siniverse.cc` before
   switching the site. Its production CORS origin must be exactly
   `https://finapp.siniverse.cc`, with credentials allowed. The API owns the
   HttpOnly session cookie and Google OAuth credentials. The site never stores
   an access or refresh token. The API must validate OAuth `return_to` against
   the exact production origin; Finapp sends only the origin and pathname.
4. Check the `workers.dev` preview with synthetic plans, then remove the
   existing Pages mapping for `finapp.siniverse.cc` and add that custom domain
   to the Worker in the Cloudflare dashboard. Replace the old Pages DNS record
   as required by Cloudflare; a custom domain cannot point to both deployments.
   Keep the old Pages project available for rollback while checking the new
   site, without leaving two active production publishers.
5. **Before the next Workers Builds deployment**, update `wrangler.jsonc` in
   the repository to declare the new custom domain and disable the temporary
   `workers.dev` preview, then publish that config change:

   ```diff
   - "workers_dev": true,
   + "workers_dev": false,
   + "routes": [{ "pattern": "finapp.siniverse.cc", "custom_domain": true }],
   ```

   Keep these entries at the top level beside `assets`, and update the
   corresponding routing assertions in `test/cloudflare-worker-build.test.mjs`.
   Wrangler reconciles dashboard routes on deployment; leaving the initial
   preview-only config in Git can remove the dashboard domain on a later
   publish. The transition is complete only after this config has deployed.
6. Check the live page, offline reload, manifest, local projects, JSON export
   and restore, and Drive account connection, compare, and disconnect. The
   Worker uses SPA navigation fallback when there is no matching static file,
   retaining the old Pages behavior. The app's service worker precaches only
   public assets; neither session responses nor Drive data enter that cache.

Workers Builds repeats the test and cache guards on the published revision.
GitHub Actions runs an additional, non-publishing build check for pull requests
and pushes. If the repository history is too shallow to compare a changed
precached asset with the previous commit, the production build stops instead
of publishing a release with an unverified cache version.

## Existing data and development

The production host keeps its exact origin, so its current browser projects,
recovery drafts and PWA installation remain available. The existing Drive
backup namespace remains the same. Before switching origins or removing any
older site, download a JSON backup on each device and retain the old export
path for recovery. OAuth clients from an older Google Cloud project cannot
automatically discover Drive files created by another OAuth project.

The `dev` environment in `wrangler.jsonc` reserves the name
`siniverse-finapp-site-dev` for a future, separately authorized rollout; it
does not have a deployment route. Workers Builds currently publishes `main` only.
The old GitHub Pages `/dev/` entry point redirects to production until a new
development host is activated. Its application remains at
`https://sinikebe.github.io/finapp/dev/recovery.html` for local JSON export,
using its separate storage namespace and Google Identity Services sign-in.
Neither that recovery page nor a local build uses the production session API.
To inspect a non-published preview bundle locally:

```sh
node tools/build-cloudflare.mjs --branch dev --domain example.test --out /tmp/finapp-preview
```

The output directory must be new and outside the source checkout. Generated
`deployment-config.js` contains only public origins, never credentials.
