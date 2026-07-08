# DEV-NOTES — VS-2 Unified resolve API + linear step runner

**Slice:** VS-2  
**Branch:** `feat/step-contracts-vs-2-resolve`  
**Date:** 2026-07-08

## Summary

Shipped unified step resolve (`POST /v1/runs/{run_id}/steps/{step_id}/resolve` + `murrmure_resolve_step`), linear top-level step_contract runner, `awaiting_human` step memos, explicit_resolve for agent executor steps, and migrated `preview-review-v2` to v2.2 linear manifest (top-level review kept until VS-7).

## Files touched

### contracts
- `packages/contracts/src/entities/run-step-memo.ts` — add `awaiting_human` status

### hub-core
- `packages/hub-core/src/flow-engine/step-catalog.ts` — catalog helpers
- `packages/hub-core/src/flow-engine/step-open.ts` — open step (human/agent)
- `packages/hub-core/src/flow-engine/step-resolve.ts` — resolve + bootstrap + route apply
- `packages/hub-core/src/flow-engine/advance-runner.ts` — step_contract bootstrap; skip legacy advance
- `packages/hub-core/src/flow-engine/plan.ts` — include `step_contract` in linear plan
- `packages/hub-core/src/projections/step-memo.ts` — STEP_OPENED/STEP_RESOLVED journal mapping
- `packages/hub-core/src/grants/migrate.ts` — `step:resolve` capability
- `packages/hub-core/test/unit/flow-engine/advance-runner.test.ts` — new

### hub-daemon
- `packages/hub-daemon/src/routes/runs/resolve-step.ts` — HTTP handler
- `packages/hub-daemon/src/routes.ts` — mount resolve routes
- `packages/hub-daemon/src/mcp-handlers.ts` — `murrmure_resolve_step`
- `packages/hub-daemon/src/mcp-tool-registry.ts` — tool + capability
- `packages/hub-daemon/src/routes/sessions/index.ts` — explicit_resolve memo projection
- `packages/hub-daemon/test/http/runs/resolve-step.test.ts` — new
- `packages/hub-daemon/test/http/deprecated-removed.test.ts` — resolve_step in catalog

### shell-web
- `packages/shell-web/src/lib/view-resolve-adapter.ts` — `mapViewSubmitToResolveStep`
- `packages/shell-web/src/lib/view-resolve-adapter.test.ts` — new cases

### example + cli tests
- `examples/flows/preview-review-v2/murrmure/flows/preview-review/flow.manifest.yaml` — v2.2 linear
- `examples/flows/preview-review-v2/skills/feature-build/SKILL.md` — resolve_step
- `packages/cli/test/preview-review-v2-example.test.ts` — v2.2 expectations

### docs / specs
- `studio-specs/current/bridges/step-contract.md` — resolve API section
- `studio-specs/current/bridges/action-invoke.md` — explicit_resolve note
- `studio-specs/plans/2026-07-07-step-contracts-unified-state-machine.md` — VS-2 status
- `apps/docs/reference/mcp-tools.md`
- `packages/cli/skill/reference/mcp.md`
- `apps/docs/guide/tutorials/01-local-preview-review/08-run-the-loop.md`

## Commands run

```bash
git checkout -b feat/step-contracts-vs-2-resolve

pnpm --filter @murrmure/contracts build
pnpm --filter @murrmure/hub-core build
pnpm exec vitest run --project @murrmure/hub-core test/unit/flow-engine/advance-runner.test.ts
pnpm exec vitest run --project @murrmure/hub-daemon test/http/runs/resolve-step.test.ts
pnpm exec vitest run --project @murrmure/hub-daemon test/http/deprecated-removed.test.ts
pnpm exec vitest run --project @murrmure/cli test/preview-review-v2-example.test.ts
pnpm exec vitest run --project @murrmure/shell-web src/lib/view-resolve-adapter.test.ts
```

## Manual test notes

1. Re-apply space with migrated linear manifest (`mrmr space apply --strict`).
2. Mint grant with `step:resolve` (replaces `gate:resolve` for flow step completion).
3. Run preview-review → intake resolves via view (VS-3 wires ViewCanvasHost to resolve; curl/MCP works now).
4. Agent build step: `murrmure_resolve_step({ step_id: "build", branch: "completed", payload: { preview_url } })`.
5. Human review: view submit → `branch: validated | changes_required` (shell wiring VS-3).

## Known gaps (VS-3+)

- ViewCanvasHost still binds pending **gates** for legacy flows; step_contract human steps use `awaiting_human` memos without gates until VS-3.
- Nested steps / engine-routed goto — VS-7.
- `active-step-contract.json`, prompt injection — VS-5.
- `complete_action` / `wait_for_gate` still registered (VS-8 removal).
- Terminal run late-resolve 409, monotonic memos — VS-4.

## Grant capabilities (manual)

```bash
mrmr grant mint --space spc_… \
  --capabilities flow:run,flow:read,action:invoke,step:resolve,space:read,journal:read \
  --label cursor
```
