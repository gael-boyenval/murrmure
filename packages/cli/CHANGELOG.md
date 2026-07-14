# @murrmure/cli

## Unreleased

### Added

- `mapHubDenial` surfaces the Hub's typed `code` and `message` for non-2xx
  responses (including `409 FLOW_CONCURRENCY_LIMIT` and
  `409 SPACE_HAS_ACTIVE_RUNS`) instead of collapsing them to a generic
  `HUB_ERROR`.

### Breaking Changes

- Step resolve now prints the Hub's normalized branch-contract errors in both
  human and JSON output instead of collapsing them to a generic message. New
  View scaffolds typecheck before bundling and include upload progress/cancel.
- Local tool authorization uses `mrmr connection`; removed public `grant`,
  `space grant`, `space onboard`, and legacy action command paths without
  aliases. Local MCP files contain Hub/connection IDs only, while credentials
  are stored in macOS Keychain.
- Added exact `tutorial-builder/v1` defaults, multi-context adapter installation,
  generic no-write instructions, reload/resume state, connection rotation and
  revocation, and stable bundled-launcher descriptors.
- Flow manifests use `triggers` as the only start-condition field. The legacy
  `start` (including dual `start` + `triggers`), `requires_view`, `role`,
  `presentation`, `deriveRole`, and superseded routing keys (`next`, `fail_run`,
  `goto`, `fail`, `complete`, `continue`) are rejected by the strict schema with
  no fallback. Step contracts are resolver-agnostic; branches use flat
  `route`/`resume` semantics and receive injected `completed`/`failed` defaults
  when omitted. `mrmr space flow init` templates and docs-proof fixtures are
  migrated to the clean shape.
- `mrmr setup` creates one user-named space and offers explicit local-tool
  connection consent after apply.
- `mrmr space init` derives its name/slug from the target folder, remains
  offline, and scaffolds no credential or MCP configuration.
- Removed legacy `murrmure mcp` / `mrmr mcp` onboarding shape from docs and setup flows.
- MCP onboarding targets Desktop's stable
  `~/.murrmure/bin/murrmure-mcp` launcher with ID-only arguments.

## 1.0.1

### Patch Changes

- Updated dependencies
  - @murrmure/contracts@0.1.1
  - @murrmure/hub-core@0.1.1

## 1.0.0

### Major Changes

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

## 0.2.0

### Breaking

- Default output is human-readable; use `--json` in scripts.
- Hub commands moved under `mrmr runtime`:
  - `mrmr events` → `mrmr runtime events --space <id>`
  - `mrmr gates` → `mrmr runtime gates --space <id>`
  - `mrmr transition` → `mrmr runtime transition --space <id>`
  - `mrmr wait` → `mrmr runtime wait --space <id>`
  - `mrmr audit export` → `mrmr runtime audit export --space <id>`
- `mrmr review` was never implemented; removed from docs. Use MCP or review-loop HTTP API.

### Added

- `mrmr login`, `logout`, `whoami` with `~/.murrmure/credentials`
- `mrmr doctor` — hub health, auth source, scope capability summary, dev-kit skew
- `mrmr space` (init, CRUD, grant, member, trigger)
- `mrmr hub` (federation, grants-export)
- `--help` on all commands; scope preflight
- citty framework; human formatters for `mrmr flow *` and `mrmr skill *`
- `mrmr flow doctor` is a deprecated alias for `mrmr doctor` (prints stderr hint)

## 0.1.1

### Patch Changes

- Accept MURRMURE*HUB_TOKEN and legacy STUDIO_API*\* aliases in hub auth. Move digest helpers to flow-dev-kit (`./digest` export). Rebrand dev-sim and init scaffolds to flow vocabulary.
- Updated dependencies
  - @murrmure/flow-dev-kit@0.1.1
