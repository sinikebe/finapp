# Working on Finapp

Use reviewed feature-branch pull requests. Preserve workspace/backup formats,
production and preview storage boundaries, bilingual copy, PWA scope isolation
and the legacy Pages redirect/recovery behavior.

## Branch promotion

- Open every change PR, including docs and infrastructure, against `dev`.
  Work on a topic branch; do not push code directly to `dev` or `main`.
- Agents may merge a reviewed, green PR into `dev` without another user
  approval. Verify the resulting dev deployment before proposing promotion.
- `main` accepts only a PR whose source is this repository's `dev` branch,
  after the user has tested dev and explicitly approved production promotion.
  Never merge a feature branch into `main` or promote without that approval.
- Do not advance `dev` from an untested `main` as a shortcut.

## Versioned pull requests

- Use `feat:` for a feature, `fix:` for a correction, and
  `!` / `BREAKING CHANGE` for breaking changes.
- Titles describe the change but do not select its version increment.
  Each integration on dev increments patch once; a merge counts once without
  recounting its feature branch commits. Each dev-to-main promotion increments
  the previous production minor once and resets patch to zero. `semver:*` labels
  do not override this rule. Retries reuse the existing exact commit version.
- Actual versions belong to shared CI and its immutable annotated per-channel
  tags `siniverse-version/main/vX.Y.Z` and `siniverse-version/dev/vX.Y.Z`.
  package.json/package-lock 0.0.1 is only the local fallback.
- Do not manually bump public versions or the technical cache counter, add a
  competing version workflow, or rewrite release tags.
- Keep the version/content fingerprint verification and its stale-artifact
  regressions. Add new runtime modules to PRECACHE; never clear user storage
  or change backup schemas to deliver a release.

See CONTRIBUTING.md for checks, adapters and release details.
