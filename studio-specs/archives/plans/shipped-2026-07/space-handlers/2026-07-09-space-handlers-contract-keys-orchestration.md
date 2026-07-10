# Space Handlers & Contract Keys — Orchestration Progress

**Started:** 2026-07-09  
**Plan:** [2026-07-09-space-handlers-contract-keys-plan.md](./2026-07-09-space-handlers-contract-keys-plan.md)

## Loop per vertical slice

1. **Dev** — `gpt-5.3-codex-high`
2. **Review** — `claude-opus-4-8-thinking-high`
3. **Fix** — `composer-2.5-fast`
4. Repeat until slice acceptance criteria pass

## Status

| Slice | Dev | Review | Fix loops | Status |
|-------|-----|--------|-----------|--------|
| VS-0 — Decision lock + scaffold | done | PASS | 0 | **DONE** |
| VS-1 — Minimal handler E2E | done | PASS WITH FIXES | 1 | **DONE** |
| VS-2 — Nested subgraph-owner | done | PASS WITH FIXES | 1 | **DONE** |
| VS-3 — Completion modes + HANDLER-CUTOVER | done | FAIL→FIX | 1 | **DONE** |
| VS-4 — `.mrmr/` layout cutover | done | PASS | 0 | **DONE** |
| VS-5 — Bindings + event parity + doctor | done | PASS | 0 | **DONE** |
| VS-6 — Docs/skills + MCP health | done | PASS | 0 | **DONE** |

## Dev / review / fix packets

### VS-0 — Decision lock + orchestration scaffold

**Goal:** Lock decisions; create tracker; gate VS-1.

**Allowed files:**
- `studio-specs/current/bridges/handlers.md`
- `studio-specs/plans/orchestration/2026-07-09-space-handlers-contract-keys-orchestration.md`
- `packages/cli/test/handlers-decision-record.test.ts`

**Tests:** `handlers-decision-record.test.ts` — Q1, Q3, Q4, Q6, Q7 marked `DECIDED`.

**Done gate:** VS-0 status `DONE`; VS-1 may start.

---

### VS-1 — Minimal handler E2E

**Goal:** Parser, lint, single-step dispatch, `murrmure_list_handlers` MCP.

**Allowed files:**
- `packages/hub-core/src/index/parse-handlers.ts` (new)
- `packages/hub-core/src/index/handler-catalog-lint.ts` (new)
- `packages/hub-core/src/flow-engine/step-open.ts` (handler match path — dual-read OK until VS-3)
- `packages/contracts/src/entities/handler.ts` (new)
- `packages/hub-daemon/src/mcp-handlers.ts`
- `packages/hub-core/test/unit/index/handlers-parse.test.ts` (new)
- `packages/hub-core/test/unit/index/handler-catalog-lint.test.ts` (new)
- `packages/hub-core/test/unit/flow-engine/handler-dispatch.test.ts` (new)
- `packages/hub-daemon/test/http/mcp/list-handlers.test.ts` (new)
- `packages/cli/test/preview-review-v2-example.test.ts` (extend)

**Tests:** `handlers-parse.test.ts`, `handler-catalog-lint.test.ts`, `handler-dispatch.test.ts`, `list-handlers.test.ts`.

**Done gate:** open `write_spec` → one dispatch → resolve → run advances.

---

### VS-2 — Nested subgraph-owner loop

**Goal:** Multi-key scope assembly, `kill_on`, prompt ordering, no human shell dispatch.

**Allowed files:**
- `packages/executors/src/invoke-shell-prompt.ts`
- `packages/hub-core/src/flow-engine/step-open.ts`
- `packages/hub-core/test/unit/flow-engine/handler-dispatch.test.ts`
- `packages/executors/conformance/invoke-shell-prompt.test.ts` (new)

**Done gate:** nested `changes_required` loop without duplicate dispatch.

---

### VS-3 — Completion modes + HANDLER-CUTOVER

**Goal:** Remove executor coupling; `complete` modes; `mrmr step resolve`; atomic cutover.

**Allowed files:** per plan code map — contracts, hub-core step-resolve/open, cli step-resolve, shell-spawn, delete legacy parsers.

**Done gate:** no `executor.action` in examples; legacy parser exports removed.

---

### VS-4 — `.mrmr/` layout cutover

**Goal:** Migrate trees; merge link; delete briefing.

**Allowed files:** space-directory, space-link-file, wake-relay, scaffold templates, layout tests.

**Done gate:** `layout-cutover-grep.test.ts` passes; no briefing assertions.

---

### VS-5 — Bindings + event parity + doctor

**Goal:** bindings.yaml, federation test, event handlers, doctor lint codes.

**Done gate:** all binding/handler doctor tests pass.

---

### VS-6 — Docs/skills hardening + MCP health

**Goal:** Split skills, docs-proof bans, `murrmure_space_health`, `murrmure_get_run_context`.

**Done gate:** skill-install-variants, docs-proof, space-health tests pass.

## CI gates — final status

| Gate | Status |
|------|--------|
| VS-0 decision record (handlers-decision-record.test.ts) | ✅ |
| Handler parse/lint/dispatch E2E | ✅ |
| Subgraph owner scope + no duplicate dispatch | ✅ |
| HANDLER-CUTOVER (no executor.action in examples) | ✅ |
| `mrmr step resolve` + complete modes | ✅ |
| `.mrmr/` layout cutover (layout-cutover-grep) | ✅ |
| Bindings + federation + event handlers | ✅ |
| Doctor handler/binding/skill codes | ✅ |
| MCP list_handlers + space_health + get_run_context | ✅ |
| docs-proof legacy bans | ✅ |
| Contract codegen on apply | ✅ |

## Product integrity checklist

- [x] Flow manifests protocol-only (no `executor.action`)
- [x] Spaces execute via `handlers.yaml` + `contract_keys`
- [x] Unified `.mrmr/{space,flows,views,dev}` layout
- [x] `space.yaml` carries `link:` block (no `link.json`)
- [x] Briefing generation/injection removed
- [x] `complete: auto|cli|explicit` + run-scoped resolve token
- [x] Skills split: murrmure-agent + murrmure-developer
- [x] Legacy parsers deleted (parse-actions/hooks/executors)
- [ ] Manual sign-off: per-step handler run, subgraph-owner loop, worker federation E2E


| Slice | Review file |
|-------|-------------|
| Plan (pre-impl) | [architecture](./2026-07-09-space-handlers-contract-keys-plan-review-architecture.md) |
| Plan (pre-impl) | [testability](./2026-07-09-space-handlers-contract-keys-plan-review-testability.md) |
| Plan (pre-impl) | [vertical-slices](./2026-07-09-space-handlers-contract-keys-plan-review-vertical-slices.md) |
