# @murrmure/cli

## Unreleased

### Breaking Changes

- Removed legacy `murrmure mcp` / `mrmr mcp` onboarding shape from docs and setup flows.
- MCP onboarding now targets `@murrmure/mcp-bridge` (`murrmure-mcp`) with thin config (`MURRMURE_HUB_TOKEN` only).
- Added grant token switching via `mrmr grant use --space <spc_...>` with per-space token storage under `~/.murrmure/grants/`.

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
