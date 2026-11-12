# Cloudflare Pages deployment

The source repository can be private; the static files served to browsers remain public. Keep user data, OAuth client secrets, and Cloudflare credentials out of the site and source tree.

The `Cloudflare Pages` workflow builds a **non-published** preview in pull requests and on pushes to `main` or `dev` without a Cloudflare account, credentials, or purchased domain; it uses the reserved `example.test` domain. Deployment is disabled until the repository variable `CLOUDFLARE_DEPLOY_ENABLED` is set to `true`. Once enabled, it deploys only the current tip of `main` or `dev` after a successful CI push run for the exact commit. Manual redeploys follow the same CI gate. The older GitHub Pages workflow continues to run during migration.

GitHub runs `workflow_run` and `workflow_dispatch` workflows only when their file exists on the **default branch (`main`)**. First merge the builder and this dormant workflow into `dev`, verify its pull request and push build checks, then promote the tested changes to `main` while `CLOUDFLARE_DEPLOY_ENABLED` is unset. Verify the `main` build check. Merely leaving the workflow in `dev` does not enable deployment, even after adding Cloudflare credentials.

## One-time setup

1. Obtain a domain and set up its DNS zone in Cloudflare. Create one Cloudflare Pages **Direct Upload** project for Finapp, with `main` as its production branch.
2. In GitHub repository Settings, configure variables `SUITE_DOMAIN` (for example, `example.fr`) and `CLOUDFLARE_PROJECT` (the exact Pages project name). Add secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Give that token **Account → Cloudflare Pages → Edit** permissions for the correct Cloudflare account, with no unrelated product permissions.
3. Add `finapp.example.fr` to the production project and, after deploying `dev`, route `dev.finapp.example.fr` to the stable `dev.<project>.pages.dev` branch alias using a proxied DNS record. Replace `example.fr` with your domain.
4. After the workflow and branch-specific build scripts are tested on **both** branches, enable `CLOUDFLARE_DEPLOY_ENABLED=true`, then manually dispatch the Cloudflare workflow once for `dev` and once for `main`. Verify both websites, service workers, manifests, import/export, and the Google Drive account chooser. Register the exact new HTTPS JavaScript origins with Google's OAuth client before testing Drive.
5. Migrate browser-local workspaces and previous Drive namespaces while the old GitHub Pages addresses remain available. Only then consider making the source repository private. Keep a public export path on the old origin for later recovery.

Cloudflare's `pages.dev` aliases and preview deployments are publicly accessible by default. Keep dev fixtures synthetic, and restrict previews if necessary. Creating a Direct Upload project is an intentional choice: changing a Pages project later from Direct Upload to Git integration requires recreating it.
