# Working on Finapp

Use reviewed feature-branch pull requests. Preserve workspace/backup formats,
production and preview storage boundaries, bilingual copy, PWA scope isolation
and the legacy Pages redirect/recovery behavior.

## Versioned pull requests

- Use `feat:` for a feature, `fix:` for a correction, and
  `!` / `BREAKING CHANGE` for breaking changes.
- The shared CI classifies these titles. Other merges default to patch.
  At most one `semver:major`, `semver:minor` or
  `semver:patch` label may override classification.
- Actual versions belong to shared CI and its immutable annotated per-channel
  tags `siniverse-version/main/vX.Y.Z` and `siniverse-version/dev/vX.Y.Z`.
  package.json/package-lock 0.0.1 is only the local fallback.
- Do not manually bump public versions or the technical cache counter, add a
  competing version workflow, or rewrite release tags.
- Keep the version/content fingerprint verification and its stale-artifact
  regressions. Add new runtime modules to PRECACHE; never clear user storage
  or change backup schemas to deliver a release.

See CONTRIBUTING.md for checks, adapters and release details.
