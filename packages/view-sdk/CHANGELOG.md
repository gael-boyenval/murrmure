# @murrmure/view-sdk

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
