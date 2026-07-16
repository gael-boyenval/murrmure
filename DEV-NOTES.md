# DEV-NOTES — VS-8 Hard cutover cleanup + publication

**Slice:** VS-8  
**Branch:** `feat/step-contracts-vs-8-cutover`  
**Base:** merge of `feat/step-contracts-vs-6-artifacts` + `feat/step-contracts-vs-7-nested`

## Summary

Final hard cutover for unified step contracts v2.2: removed legacy MCP tools (`complete_action`, `wait_for_gate`, `resolve_gate`), removed `POST /v1/runs/.../complete` HTTP route, reject `invoke`/`checkpoint`/`gate` at parse time, updated docs/skills/tutorials, marked step-contract bridge shipped.

## Files touched

### Hub daemon
- `packages/hub-daemon/src/mcp-tool-registry.ts` — removed deprecated tools
- `packages/hub-daemon/src/mcp-handlers.ts` — removed handlers
- `packages/hub-daemon/src/routes/sessions/index.ts` — removed complete-action route
- `packages/hub-daemon/test/http/deprecated-removed.test.ts` — VS-8 assertions
- deleted `packages/hub-daemon/test/http/actions/complete-action.test.ts`

### Hub core / contracts
- `packages/contracts/src/flow/manifest.ts` — removed invoke/checkpoint/gate from FlowStepSchema
- `packages/hub-core/src/index/parse-flow-manifest.ts` — `rejectLegacyStepKinds` at parse
- `packages/hub-core/src/flow-engine/step-contract-compile.ts` — `scanRawLegacyStepKinds`
- `packages/hub-core/src/flow-engine/compile.ts` — removed legacy IR sugar
- `packages/hub-core/src/flow-engine/step-open.ts` — merge conflict resolved (VS-6 artifacts + VS-7 nested)

### Docs / skills / specs
- Tutorial 1 parts 02–09, tutorials index
- `apps/docs/reference/mcp-tools.md`, `apps/docs/guide/known-gaps.md`, `apps/docs/guide/cli.md`
- `packages/cli/skill/reference/mcp.md`, `gates.md`, `known-gaps.md`
- `studio-specs/current/bridges/step-contract.md` — marked shipped
- `studio-specs/plans/2026-07-07-step-contracts-unified-state-machine.md` — shipped
- `studio-specs/plans/README.md`

### Tests
- `packages/hub-core/test/unit/flow-engine/manifest.test.ts`
- `packages/hub-core/test/unit/index/parse-flow-manifest.test.ts`
- `packages/hub-core/test/unit/flow-engine/step-contract-compile.test.ts`
- `packages/cli/test/docs-proof.test.ts`

## Commands run

```bash
pnpm --filter @murrmure/hub-core test
pnpm --filter @murrmure/hub-daemon test deprecated-removed resolve-step nested-resolve
pnpm --filter @murrmure/cli test docs-proof preview-review-v2
```

## Manual tester notes (murrmuretuto)

1. Full Tutorial 1 loop (same as VS-7 acceptance).
2. MCP catalog must **not** list `murrmure_complete_action`, `murrmure_wait_for_gate`, `murrmure_resolve_gate`.
3. Legacy manifest apply must fail with `LEGACY_STEP_KIND`.
4. `POST .../steps/{id}/complete` returns 404.

## Known gaps

- See [apps/docs/guide/known-gaps.md](./apps/docs/guide/known-gaps.md) for current operator-visible gaps.
