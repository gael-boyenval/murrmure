# @murrmure/view-sdk

## Unreleased

### Breaking Changes

- `submitBranch` accepts `{ payload?, files? }` with browser `File`/`Blob`
  values. Added normalized field errors, monotonic submission progress, and
  in-flight cancellation. Removed the params-only/direct mutation submission
  shape; production submission is trusted-host mediated.

## 0.2.1

### Patch Changes

- Publish view-sdk dependency chain to npm with registry semver deps (no `workspace:*`).

  - `@murrmure/contracts` and `@murrmure/shell-client` are public packages with Trusted Publisher
  - `@murrmure/view-sdk` pins `^0.1.x` registry deps for external view scaffolds

- Updated dependencies
  - @murrmure/contracts@0.1.1
  - @murrmure/shell-client@0.1.1

## 0.2.0

### Minor Changes

- Murrmure v2 product plan (phases 01–10): ViewCanvasHost, engine completion, FDK removal, unified skill, CLI wizards, docs proof gates, and `@murrmure/view-sdk/app`.

  ### Breaking (@murrmure/cli)

  - Removed FDK worker runtime and all `mrmr flow init|validate|build|push|dev --sim` commands.
  - Flows and views are authored under `murrmure/` and indexed with `mrmr space apply`.
  - `human_only` install policy enforced on apply for agent grants.

  ### Added

  - `mrmr setup`, `mrmr space onboard`, `mrmr space flow init`, `mrmr space view init`, `mrmr view dev`.
  - Apply validation (`--strict`), checkpoint `on_resolve` branching, headless run notifications fix.
  - Docs tutorial parity, CI proof gates (`check:docs-proof`, `check:fdk-docs`, strict doc-tracker).

  ### Added (@murrmure/view-sdk)

  - Public `@murrmure/view-sdk/app` with `createViewMount` for custom view authors.
