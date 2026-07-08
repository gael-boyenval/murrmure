# DEV-NOTES — VS-4 Safety invariants

**Slice:** VS-4  
**Branch:** `feat/step-contracts-vs-4-safety`  
**Base:** `45308cf` (VS-3)

## Summary

Safety invariants for step-contract runs: monotonic step memos, terminal-run late resolve rejection (409), executor cancel on run failure, and split human/agent timeouts (ISSUE-14).

## Files touched

### Hub core
- `packages/hub-core/src/projections/step-memo.ts` — monotonic terminal transitions
- `packages/hub-core/src/flow-engine/step-resolve.ts` — reject resolve on terminal run
- `packages/hub-core/src/invoke/run-executor-cancel.ts` — **new** registry + shell SIGTERM/SIGKILL
- `packages/hub-core/src/invoke/dispatch.ts` — start/stop executor timeout scheduler
- `packages/hub-core/src/run/service.ts` — cancel executors + poll store on `failRunWithNotification`
- `packages/hub-core/src/executors/timeout-scheduler.ts` — **new** pause during `awaiting_human`
- `packages/hub-core/src/executors/timeout-sweep.ts` — **new** periodic sweep + improved `ACTION_TIMED_OUT` copy
- `packages/hub-core/src/executors/queue-store.ts` — `cancelOfferedForRun`, `extendOfferedDeadlinesForRun`
- `packages/hub-core/src/projections/notifications.ts` — `runFailedNotificationCopy`, timeout summaries

### Executors
- `packages/executors/src/shell-spawn.ts` — `onProcessStart` hook for cancel registration

### Hub daemon
- `packages/hub-daemon/src/invoke-service.ts` — register shell cancel; `ACTION_TIMED_OUT` reason
- `packages/hub-daemon/src/routes/sessions/index.ts` — sync human-wait pause on step journal events
- `packages/hub-daemon/src/main.ts` — start timeout sweep interval

### Docs / example / specs
- `apps/docs/guide/tutorials/01-local-preview-review/09-troubleshooting.md` — timeouts section
- `examples/flows/preview-review-v2/murrmure/actions.yaml` — `feature_write_spec.timeout_ms: 300000`
- `studio-specs/current/bridges/step-contract.md` — engine invariants section
- `studio-specs/plans/2026-07-07-phase-a-findings.md` — ISSUE-14 marked fixed

### Tests
- `packages/hub-core/test/unit/projections/step-memo.test.ts` — monotonic
- `packages/hub-core/test/unit/flow-engine/step-resolve.test.ts` — late resolve rejected
- `packages/hub-core/test/unit/executors/timeout-scheduler.test.ts` — human wait excluded
- `packages/hub-core/test/unit/invoke/run-executor-cancel.test.ts` — cancel handles
- `packages/hub-daemon/test/http/actions/invoke-run-failed-notification.test.ts` — cancel on fail

## Commands run

```bash
pnpm exec vitest run --project @murrmure/hub-core \
  test/unit/projections/step-memo.test.ts \
  test/unit/flow-engine/step-resolve.test.ts \
  test/unit/executors/timeout-scheduler.test.ts \
  test/unit/invoke/run-executor-cancel.test.ts

cd packages/hub-daemon && pnpm exec vitest run \
  test/http/actions/invoke-run-failed-notification.test.ts
```

All green.

## Manual tester notes (murrmuretuto)

1. Start run; cancel at intake → run `failed`; late `resolve_step` → **409** `RUN_TERMINAL`.
2. `write_spec` with slow agent (< timeout) + long pause on review → run must **not** fail `ACTION_TIMED_OUT` during review wait.
3. Force fail run during `feature_build` → subprocess cancelled (hub logs / `ps`).

## Known gaps (out of VS-4 scope)

- VS-5: `active-step-contract.json` + prompt injection
- VS-7: nested `build.review` goto (timeout pause already supports qualified child ids)
- VS-8: delete legacy MCP tools
