# @murrmure/cli

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
