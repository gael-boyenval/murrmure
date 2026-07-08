# DEV-NOTES — VS-7 Nested steps + engine-routed goto

**Slice:** VS-7  
**Branch:** `feat/step-contracts-vs-7-nested`  
**Base:** VS-4 + VS-5 integration (`feat/step-contracts-vs-3-shell-views` merge)

## Summary

Nested step runtime under parent **build**: `build.build-loop` ⇄ `build.review` with engine-routed `goto`, `complete: parent`, and `continue: parent`. Top-level **review** removed from preview-review manifest. Run graph shows nested nodes; HTTP resolve accepts qualified step ids (dots in path).

## Files touched

### Hub core
- `packages/hub-core/src/flow-engine/step-resolve.ts` — nested route vocabulary (`goto`, `complete_parent`, `continue_parent`); remove `NESTED_STEP_UNSUPPORTED`
- `packages/hub-core/src/flow-engine/step-open.ts` — bootstrap first nested child on parent open; contract file for leaf step only
- `packages/hub-core/src/flow-engine/step-catalog.ts` — `nestedCatalogChildren`, `parentHasNestedChildren`
- `packages/hub-core/src/flow-engine/graph.ts` — `buildStepContractRunGraph` for nested nodes + loop-back edge

### Hub daemon
- `packages/hub-daemon/src/routes/runs/resolve-step.ts` — route pattern `:step_id{[^/]+}` for qualified ids
- `packages/hub-daemon/src/routes/sessions/index.ts` — pass `step_contract_catalog` to graph builder

### Example + views
- `examples/flows/preview-review-v2/murrmure/flows/preview-review/flow.manifest.yaml` — nested build block
- `examples/flows/preview-review-v2/murrmure/views/preview-review/src/App.tsx` — read `build.build-loop` / `build.review` outputs
- `examples/flows/preview-review-v2/skills/feature-build/SKILL.md`, `agent.md`, `README.md`

### Docs / specs
- `apps/docs/guide/tutorials/01-local-preview-review/index.md`, `05-flow-manifest.md`, `08-run-the-loop.md`
- `studio-specs/current/bridges/flow-engine.md` — step contracts + nested lifecycle section

### Tests
- `packages/hub-core/test/unit/flow-engine/nested-steps.test.ts` — **new**
- `packages/hub-daemon/test/http/runs/nested-resolve.test.ts` — **new**
- `packages/cli/test/preview-review-v2-example.test.ts` — nested manifest assertions

## Commands run

```bash
pnpm exec vitest run --project @murrmure/hub-core test/unit/flow-engine/nested-steps.test.ts test/unit/flow-engine/step-resolve.test.ts
pnpm exec vitest run --project @murrmure/hub-core test/unit/flow-engine/step-contract-compile.test.ts
cd packages/hub-daemon && pnpm exec vitest run test/http/runs/nested-resolve.test.ts test/http/runs/resolve-step.test.ts
pnpm --filter @murrmure/cli test preview-review-v2-example
```

All green.

## Manual tester notes (murrmuretuto)

Full Tutorial 1 on nested manifest:

1. Intake → attach spec
2. `write_spec` → `specs/current/hero-section.md`
3. Single `feature_build` session
4. Agent resolves **`build.build-loop`** with `preview_url` (not top-level `build`)
5. Engine opens **`build.review`** without agent invoke — iframe in ViewCanvasHost
6. Feedback round: `changes_required` → engine reopens **`build.build-loop`** → resolve again → **`build.review`** again
7. Validate → parent **build** completes → **archive** → **commit**
8. Run graph shows `build.build-loop` and `build.review` nested under **build**

Record: run_id, iteration count on loop-back, screenshots.

**Grant:** `step:resolve` required (unchanged from VS-2).

## Known gaps (out of VS-7 scope)

- VS-6: artifact slots / work upload routes (local WIP may exist untracked)
- VS-8: delete legacy MCP tools; strict apply rejects invoke/checkpoint YAML
- murrmuretuto manifest mirror (external repo — copy from `examples/flows/preview-review-v2/`)
