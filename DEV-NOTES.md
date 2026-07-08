# DEV-NOTES — VS-5 Discovery injection

**Slice:** VS-5  
**Branch:** `feat/step-contracts-vs-5-discovery`  
**Base:** `45308cf` (VS-4)

## Summary

Step contract discovery at runtime: `StepContractSlice` generator, `active-step-contract.json` on every step open, `MURRMURE_STEP_CONTRACT` / `{{murrmure.agentStepContract}}` prompt injection, `murrmure_list_step_contracts` MCP + `GET /v1/runs/{id}/step-contracts`, action prompt token lint at apply.

## Files touched

### Contracts
- `packages/contracts/src/entities/step-contract.ts` — `StepContractSliceBranch.then`, `ListStepContractsResponse`

### Hub core
- `packages/hub-core/src/flow-engine/step-contract-slice.ts` — **new** slice builder, file writer, markdown render, list response
- `packages/hub-core/src/flow-engine/step-open.ts` — write `active-step-contract.json` on open
- `packages/hub-core/src/flow-engine/step-contract-compile.ts` — fix known token paths; `lintActionMurrmureTokens`
- `packages/hub-core/src/flow-engine/engine-capabilities.ts` — lint actions at apply
- `packages/hub-core/src/flow-engine/index.ts` — export slice module
- `packages/hub-core/src/invoke/dispatch.ts` — pass `step_contract` to executors

### Runtime / executors
- `packages/runtime-contracts/src/types/invoke.ts` — `step_contract` on request + dispatch context
- `packages/executors/src/invoke-shell-prompt.ts` — `murrmure_bindings` in templates
- `packages/executors/src/shell-spawn.ts` — `MURRMURE_STEP_CONTRACT`, path, workdir env vars

### Hub daemon
- `packages/hub-daemon/src/routes/runs/step-contracts.ts` — **new** HTTP list endpoint
- `packages/hub-daemon/src/routes.ts` — mount route
- `packages/hub-daemon/src/mcp-tool-registry.ts` — `murrmure_list_step_contracts`
- `packages/hub-daemon/src/mcp-handlers.ts` — MCP handler
- `packages/hub-daemon/src/invoke-service.ts` — build injection context for flow invokes

### Docs / skills / example
- `studio-specs/current/bridges/step-contract.md` — discovery injection section
- `apps/docs/guide/tutorials/01-local-preview-review/04-prompt-triggers.md` — contract injection (no `complete_action`)
- `apps/docs/reference/mcp-tools.md` — `list_step_contracts`
- `packages/cli/skill/reference/mcp.md` — contract file loop
- `examples/flows/preview-review-v2/murrmure/actions.yaml` — `{{murrmure.agentStepContract}}`
- `examples/flows/preview-review-v2/skills/feature-build/SKILL.md` — contract file loop

### Tests
- `packages/hub-core/test/unit/flow-engine/step-contract-slice.test.ts`
- `packages/hub-daemon/test/http/runs/step-contracts.test.ts`
- `packages/cli/test/preview-review-v2-example.test.ts` — no `complete_action` in skill/actions

## Commands run

```bash
pnpm exec vitest run --project @murrmure/hub-core test/unit/flow-engine/step-contract-slice.test.ts
pnpm exec vitest run --project @murrmure/hub-core test/unit/flow-engine/step-contract-compile.test.ts
cd packages/hub-daemon && pnpm exec vitest run test/http/runs/step-contracts.test.ts
pnpm --filter @murrmure/cli test preview-review-v2-example
```

All green.

## Manual tester notes (murrmuretuto)

1. Start `preview-review` run → inspect `.mrmr.temp/runs/{run_id}/active-step-contract.json` (exists; matches active step).
2. Resolve intake → file rewritten for `write_spec` / next step.
3. On `feature_build` dispatch: prompt contains `{{murrmure.agentStepContract}}` block; env has `MURRMURE_STEP_CONTRACT`.
4. MCP `murrmure_list_step_contracts({ run_id })` → `active` slice + `graph_digest`.
5. Grant needs `space:read` for list tool (already on typical agent grants).

## Known gaps (out of VS-5 scope)

- VS-6: artifact slot paths in slice (`{{murrmure.step.*.artifact.*}}`)
- VS-7: nested goto; `orchestration: engine-routed` in list response for build parent
- VS-8: delete `complete_action` / `wait_for_gate` MCP tools
