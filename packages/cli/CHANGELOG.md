# @murrmure/cli

## Unreleased

### Changed

- `murrmure-agent` **1.3.13**: meeting seats pull transcript with their
  `participant_id`, read `you` / `addressed_to_you`, and do requested work on
  the turn instead of status-only replies.
- `murrmure-developer` **1.2.12**: meeting-seat recipe matches that rule.
- `murrmure-agent` **1.3.12**: meeting seat `trigger: resumed` continues the
  same `ses_*` / `ptc_*` from the transcript.
- `murrmure-agent` **1.3.11**: admin directive MCP
  (`murrmure_list_directive_eligible`, `murrmure_start_directive`, `hub:admin`).
- `murrmure-developer` **1.2.11**: directive recipe sets `timeout_ms: 3600000`.
- `murrmure-developer` **1.2.10**: directive start via admin MCP.
- `murrmure-developer` **1.2.9**: `space.yaml` `description` is the space
  purpose. Apply copies `name` / `description` onto the hub space.
- Meeting seat docs/skills: default handler uses one persistent
  `shell_spawn` PTY process from convene through close. First turn is the
  command argument; later `said` writes into that PTY. Do not put `murrmure` in
  `~/.cursor/mcp.json`.
- `murrmure-developer` **1.2.8**: handler-only directive recipe
  (`reference/directive.md`) so a space appears under header **New directive**.
- `murrmure-agent` **1.3.10** and `murrmure-developer` **1.2.7**: meeting-seat
  grant includes `blob:write` / `blob:read`. Attach with `murrmure_put_artifact`,
  then `said` with `artifacts: [xfr_*]`; peers still `murrmure_get_artifact`.
- `connection grant` accepts `blob:read` and `blob:write`. Meeting-seat recipe:
  `space:read,flow:read,flow:run,step:resolve,event:emit,journal:read,blob:write,blob:read`.

### Fixed

- `mrmr space doctor` warns when a catalog tool lacks `inputSchema.type: object`
  (Cursor then shows 0 tools).

### Added

- `mrmr space apply` includes `space.yaml` in the apply bundle.
  `space init --description` and `space link --create` seed purpose from yaml.
- `mrmr meeting start` convenes a room via `POST /v1/meetings`
  (`--title --goal --chair --participant --session`).

### Patch Changes

- `space view init` runs `npm install` by default, ships a minimal App +
  `intake` fixture, pins `@murrmure/view-sdk` to `^0.3.0`, and prints
  space-root Next steps (no `cd` trap). Vite scaffold uses `base: "./"` for
  hub-served production assets.
- `view dev` explains fixtures, prints Vite + Desktop URLs, fails early when
  Vite is missing, clears `view-dev.json` on stop, and pins port 5199.
- Richer `INVALID_FLOW_MANIFEST` / apply validation detail and colored success
  / error lines for human output.

## 1.1.0

### Minor Changes

- Fixed `mrmr space doctor --fix`: it now rewrites command-only / fat MCP
  configs to `murrmure-mcp` + `--connection <con_…>` (no `--hub`), using the
  linked-space connection when available.
- Added `mrmr connection grant`: interactive capability checklist (or
  `--capabilities`) to mint a connection with custom caps such as `event:emit`.
  Omits the `local-tools/v1` profile when the selected set differs so the Hub
  does not force least-privilege.
- Renamed the default local MCP connection profile from `tutorial-builder/v1`
  to `local-tools/v1` (same capabilities). Hub still accepts the legacy id as
  an alias.
- 82c78fc: Space-owned view resolvers, hardened host, no built-in fallback forms

  Tutorial v3 Task 04 ships the space-owned View binding and hardened host
  boundary. Operator-visible changes:

  ### `@murrmure/contracts` (breaking)

  - Handler authoring moves to `on: step.opened::{flow_name}.{qualified_step_id}`
    (and `step.resolved::…`). Bare `on: step.opened` is rejected by the strict
    `HandlerSpecSchema`; `contract_keys` is now **prompt-scope only**, not the
    binding key.
  - New `view_resolver` handler type. It binds `step.opened::…` only, carries a
    `view` (`view_id`), and forbids executor fields (`command`, `prompt`,
    `params`, `cwd`).
  - Authored `kill_on` is removed and rejected; assignment termination is
    runtime-owned.
  - `OpenStepResolverProjection` now carries a sanitized `resolver`
    (`handler_id`, `type`, `view_id?` — no command/prompt/secret) and, when a
    `view_resolver` is bound, an inline `view` ref (`view_id`,
    `origin_space_id`, `entry`, `shell_route`). `resolver: null` means unbound.
  - `SpaceIndexSnapshot` adds `views: IndexedResourceRow[]`; apply indexes Views.

  ### `@murrmure/view-sdk` (breaking)

  - `ViewAppContext` drops `token` and `gate`; adds `mode` (`production` | `dev`),
    `transport_version`, `nonce`, and `step.branches`.
  - New contract: `useViewContract`, `submitBranch(branch, params)`, `cancel()`,
    `validateBranchResolve`, `ViewContractError`, `isViewContractError`.
  - postMessage is versioned and nonce-bound; the host ACKs `submit_branch` /
    `cancel`. Removed `useViewSubmit`, `useViewHubClient`, and `resolve-step`.
  - `ViewHostFrame` hardens the iframe: `sandbox="allow-scripts"` + restrictive
    CSP; `resolveViewEntryUrl` rejects external View URLs.

  ### `@murrmure/shell-client` (breaking)

  - `RunDetailPayload.open_steps` matches the v3 projection: sanitized `resolver`,
    optional `view` ref, and `artifact_slots` on branches.

  ### `@murrmure/cli`

  - `mrmr space apply` runs `validateHandlerBindings` atomically on the post-apply
    state (typed codes: `DUPLICATE_FLOW_NAME`, `HANDLER_ORPHAN_ALIAS`,
    `HANDLER_RESOLVER_CONFLICT`, `VIEW_RESOLVER_NOT_OPENED`,
    `VIEW_RESOLVER_VIEW_NOT_FOUND`, `VIEW_RESOLVER_BUILD_MISSING`); the prior
    index is preserved on failure.
  - `HANDLER_MISSING` is removed — an unbound step is valid and observability-only.
  - Vite React view scaffold and fixtures migrated to the v3 SDK contract.

  ### Shell (operator UX)

  - The shell consumes the inline resolver/view descriptor and performs no
    client-side handler matching. Built-in fallback forms (`ViewParamForm`,
    built-in View routes, the resolve-step adapter) are removed. Unbound steps
    render an observability-only state.

  ### Docs

  - [ADR-009](../studio-specs/ADR/ADR-009-space-owned-view-resolver-and-hardened-host.md),
    `studio-specs/current/bridges/handlers.md`, `apps/docs/reference/view-sdk.md`,
    and `apps/docs/guide/space-handlers.md` synced.

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
- Added exact `local-tools/v1` defaults, multi-context adapter installation,
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
  `~/.murrmure/bin/murrmure-mcp` launcher with command-only client config
  (Hub from discovery, connection from `active.json` + Keychain).

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
