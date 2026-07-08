# DEV-NOTES — VS-6 Step artifacts + workdirs

**Slice:** VS-6  
**Branch:** `feat/step-contracts-vs-6-artifacts`  
**Base:** `feat/step-contracts-vs-3-shell-views` + VS-4 + VS-5 merges

## Summary

Per-step workdirs, `artifacts_out` promotion on resolve, hub artifact registration, `{{murrmure.step.*.artifact.*}}` prompt injection, view file upload → workdir → resolve, and example flow/docs updates.

## Files touched

### Hub core
- `packages/hub-core/src/flow-engine/step-artifacts.ts` — **new** workdir, promotion, bindings
- `packages/hub-core/src/flow-engine/step-resolve.ts` — validate + promote `artifacts_out`
- `packages/hub-core/src/flow-engine/step-open.ts` — `ensureStepWorkdir` on open
- `packages/hub-core/src/flow-engine/step-contract-slice.ts` — artifact tokens in bindings + `buildFlowInvokeStepContract`
- `packages/hub-core/src/flow-engine/templates.ts` — `{{murrmure.step.*}}` resolution
- `packages/hub-core/src/invoke/dispatch.ts` — pass `step_contract` to executors

### Hub daemon
- `packages/hub-daemon/src/routes/runs/step-work-upload.ts` — **new** view upload endpoint
- `packages/hub-daemon/src/routes/runs/resolve-step.ts` — `registerArtifact` on promotion
- `packages/hub-daemon/src/routes.ts` — mount work upload
- `packages/hub-daemon/src/invoke-service.ts` — `buildFlowInvokeStepContract` at dispatch

### Executors / runtime
- `packages/executors/src/shell-spawn.ts` — `MURRMURE_STEP_CONTRACT`, `MURRMURE_RUN_ARTIFACTS`, prompt bindings
- `packages/runtime-contracts/src/types/invoke.ts` — `run_artifacts_json` on step contract context

### View SDK / shell client
- `packages/view-sdk/src/app/resolve-step.ts` — `uploadViewArtifacts`, `artifacts_out` body
- `packages/view-sdk/src/app/provider.tsx` — `submit(params, artifacts?)`
- `packages/shell-client/src/types.ts` — `artifacts_out` on `resolveStep`

### Example / docs
- `examples/flows/preview-review-v2/murrmure/flows/preview-review/flow.manifest.yaml` — `artifact_slots` on intake
- `examples/flows/preview-review-v2/murrmure/actions.yaml` — spec path tokens
- `examples/flows/preview-review-v2/murrmure/views/preview-review-intake/src/App.tsx` — file upload
- `examples/flows/preview-review-v2/skills/feature-build/SKILL.md`, `agent.md`
- `studio-specs/current/bridges/step-contract.md`, `artifacts.md`
- `apps/docs/guide/tutorials/01-local-preview-review/05-flow-manifest.md`

### Tests
- `packages/hub-core/test/unit/flow-engine/step-resolve-artifacts.test.ts` — **new**
- `packages/hub-core/test/unit/flow-engine/step-contract-slice.test.ts` — artifact bindings
- `packages/hub-daemon/test/http/artifacts/transfer.test.ts` — work upload + resolve promotion
- `packages/view-sdk/test/resolve-step.test.ts` — `artifacts_out` mapping

## Commands run

```bash
pnpm exec vitest run --project @murrmure/hub-core \
  test/unit/flow-engine/step-resolve-artifacts.test.ts \
  test/unit/flow-engine/step-contract-slice.test.ts

cd packages/view-sdk && pnpm exec vitest run test/resolve-step.test.ts

cd packages/hub-daemon && pnpm exec vitest run test/http/artifacts/transfer.test.ts
```

All green.

## Manual tester notes (murrmuretuto)

1. Start `preview-review` run → intake view: attach spec **file** (not paste).
2. After intake resolve, inspect `.mrmr.temp/runs/{run_id}/steps/intake/spec/` for stable artifact.
3. `active-step-contract.json` / contract slice should include `steps.intake.artifact.spec.path` in `inputs_from_run`.
4. On `feature_build` dispatch, resolved prompt contains `{{murrmure.step.intake.artifact.spec.path}}` value.
5. Grant needs `step:resolve` for work upload + resolve.

## Known gaps (out of VS-6 scope)

- VS-8: delete legacy MCP tools
