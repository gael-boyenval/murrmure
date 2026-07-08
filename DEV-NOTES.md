# DEV-NOTES — VS-5 + VS-4 merged (base for VS-6)

**Slice:** VS-5 (merged into VS-3 branch) + VS-4 already present  
**Branch:** `feat/step-contracts-vs-3-shell-views` (pre-VS-6)  
**Next:** `feat/step-contracts-vs-6-artifacts`

## Summary

Merged VS-5 discovery injection on top of VS-4 safety invariants. Runtime step contract slices, `active-step-contract.json`, `murrmure_list_step_contracts`, and prompt token lint are in place. VS-6 adds per-step workdirs, `artifacts_out` promotion, and artifact path injection.

## Files touched (VS-4 + VS-5 merge)

### Contracts
- `packages/contracts/src/entities/step-contract.ts` — `StepContractSliceBranch.then`, `ListStepContractsResponse`

### Hub core (VS-4)
- `packages/hub-core/src/projections/step-memo.ts` — monotonic terminal transitions
- `packages/hub-core/src/flow-engine/step-resolve.ts` — reject resolve on terminal run
- `packages/hub-core/src/invoke/run-executor-cancel.ts` — registry + shell SIGTERM/SIGKILL
- `packages/hub-core/src/executors/timeout-scheduler.ts` — pause during `awaiting_human`

### Hub core (VS-5)
- `packages/hub-core/src/flow-engine/step-contract-slice.ts` — slice builder, file writer, markdown render
- `packages/hub-core/src/flow-engine/step-open.ts` — write `active-step-contract.json` on open
- `packages/hub-core/src/flow-engine/step-contract-compile.ts` — token lint

### Hub daemon (VS-5)
- `packages/hub-daemon/src/routes/runs/step-contracts.ts` — HTTP list endpoint
- `packages/hub-daemon/src/mcp-handlers.ts` — `murrmure_list_step_contracts`

### Docs / skills
- `apps/docs/guide/tutorials/01-local-preview-review/04-prompt-triggers.md`
- `examples/flows/preview-review-v2/skills/feature-build/SKILL.md`

## Known gaps (VS-6 scope)

- Per-step workdirs + `artifacts_out` promotion
- `{{murrmure.step.*.artifact.*}}` path injection in prompts
- View file upload → artifact slots
- VS-7: nested goto
- VS-8: delete legacy MCP tools
