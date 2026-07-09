# Changelog

## MCP reliability phase 3 (2026-07-09)

### Breaking

- MCP client onboarding now uses `murrmure-mcp` (package `@murrmure/mcp-bridge`) with thin config shape.
- Legacy fat MCP config examples (`command: "murrmure"` + `args: ["mcp"]` + space-id env pinning) are removed from docs/spec guidance.

## Murrmure v2 product GA — phases 01–10 (2026-07-03)

### Added

- **ViewCanvasHost** — full-screen custom views as the human OS; shell chrome is admin/operator mode.
- **Engine completion** — checkpoint dispatch, `disposition`/`output`, `on_resolve` branching, step outputs.
- **CLI wizards** — `mrmr setup`, `mrmr space onboard`, `mrmr space flow init`, `mrmr space view init`, `mrmr view dev`.
- **Unified agent skill** — single `murrmure` skill with 15 reference files.
- **Docs & proof** — v2 tutorials (16 pages), example trees, CI gates (`check:docs-proof`, `check:fdk-docs`, strict doc-tracker).

### Breaking

- See Phase 09 below (FDK deletion). Apply on `human_only` spaces requires human/bootstrap actor.

## Phase 09 — FDK deletion (2026-07-03)

### Breaking

- **Removed FDK worker runtime** — no `FlowWorkerPool`, `MountRegistry`, live apply, or capability worker bundles in `@murrmure/hub-daemon`.
- **Removed `@murrmure/flow-dev-kit` / `@murrmure/flow-kit`** package and all CLI FDK commands (`mrmr flow init`, `validate`, `build`, `push`, `dev --sim`, evolution subcommands).
- **Removed** `examples/capabilities/` CDK reference trees. Use `examples/flows/preview-review-v2/` and `mrmr space apply` instead.
- **`mrmr flow status` / `mrmr flow list`** now read **indexed** flows via `/v1/spaces/:id/index/flows` (no `.flow-push-state.json`).
- Deleted human docs: `flow-evolution`, `reference/flow-dev-kit`.

### Migration

- Author flows under `murrmure/flows/` and index with **`mrmr space apply`** — not `mrmr flow push`.
- Scaffold with **`mrmr space flow init`** and views with **`mrmr space view init`**.
- Custom view apps use **`@murrmure/view-sdk/app`** (`createViewMount`), not flow-kit `/react`.

## Phase 18 — package hygiene (2026-07-01)

### Breaking

- Package directories renamed: `packages/studio-*` → `packages/contracts`, `packages/executors`, `packages/hub-*`.
- npm names: `@murrmure/studio-contracts` → **`@murrmure/contracts`**, `@murrmure/studio-executors` → **`@murrmure/executors`**.
- Default SQLite path: `./data/studio.db` → **`./data/murrmure.db`** (desktop uses `~/.murrmure/murrmure.db`).
- MCP control bus: `studio/control.*` → **`murrmure/control.*`** (invoke_action, wake_pending, tools_changed, handshake_ack, contract_updated).
- Removed CLI legacy env aliases **`STUDIO_API_URL`** / **`STUDIO_API_TOKEN`** — use `MURRMURE_HUB_URL` + `MURRMURE_HUB_TOKEN` only.
- Removed unused **`@murrmure/hub-client`** package (zero dependents).

### Migration

- Update imports from `@murrmure/studio-contracts` → `@murrmure/contracts`, `@murrmure/studio-executors` → `@murrmure/executors`.
- Rename existing `studio.db` to `murrmure.db` or set `DATABASE_PATH` explicitly.
- MCP clients handling control-bus messages must listen for `murrmure/control.*` instead of `studio/control.*`.

## Murrmure v2 (2026-06-30)

Murrmure Space–Flow–Protocol v2 is the normative shipped product. Spec promoted to `studio-specs/current/product/spec.md`.

### Breaking

- Removed v1 HTTP shims: `POST /v1/spaces/{id}/instances`, `POST /v1/mcp/wake`, Configure shell routes (`/configure`, `/setup`).
- Removed v1 MCP platform tools: `get_space_state`, `transition`, `wait_for_state`, `emit_event`, `contract_versions`. Use `murrmure_*` tools (§10.9).
- Removed FDK HTTP install/evolution routes (`POST .../flows/install`, `.../evolution/*`). Worker seeding uses `POST .../flows/{id}/apply` or CLI `mrmr flow push` + apply.
- `@murrmure/flow-dev-kit` renamed to **`@murrmure/flow-kit`**.
- `@murrmure/triggers-templates` folded into hub-daemon lib + CLI templates.

### Added

- **`bun:sqlite` persistence adapter** for desktop bundle (`createRuntimePersistence` selects Bun vs better-sqlite3).
- **`runtime-adapter-http/wire`** — runtime daemon wiring merged from `@murrmure/runtime-daemon`.
- CI **`pnpm spec:lint`** — CloudEvents validation on journal fixtures.
- **`deprecated-removed.test.ts`** — asserts v1 routes return 404.

### Migration

- Instances → **Session + Run** (`POST /v1/sessions`, `POST /v1/sessions/{id}/runs`).
- `mcp_wake` → **`murrmure_invoke_action`** with indexed actions.
- Configure UI → **`mrmr grant mint`**, `/spaces/new`, `/connect`.
