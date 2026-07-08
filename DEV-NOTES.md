# DEV-NOTES — VS-3 Shell human resolve + ViewCanvasHost

**Slice:** VS-3  
**Branch:** `feat/step-contracts-vs-3-shell-views`  
**Base:** `2382dbf` (VS-2)

## Summary

ViewCanvasHost and notifications now bind to **step memos** (`awaiting_human`), not the gate queue. View submit targets `POST /v1/runs/{run_id}/steps/{step_id}/resolve`. Flow progression via `POST /gates/.../resolve` is disabled for step-contract runs (orchestration approval gates unchanged).

## Files touched

### Hub core
- `packages/hub-core/src/projections/step-memo.ts` — `STEP_OPENED` → `awaiting_human` when `role=human` or `view_id` present (C1)
- `packages/hub-core/src/projections/journal-replay.ts` — pass role/view_id into memo projection
- `packages/hub-core/src/flow-engine/step-view-ref.ts` — catalog view_ref enrichment + `findActiveHumanStep`
- `packages/hub-core/src/index/apply-index.ts` — denormalize `presentation.view_ref` at apply
- `packages/hub-core/src/flow-engine/step-open.ts` — `human_step` notifications on open
- `packages/hub-core/src/flow-engine/step-resolve.ts` — resolve human_step notifications on resolve
- `packages/hub-core/src/flow-engine/space-home.ts` — needs_attention from awaiting_human memos
- `packages/hub-core/src/gates/service.ts` — skip flow checkpoint progression for step-contract flows
- `packages/hub-core/src/projections/notifications.ts` — `human_step` kind + drafts

### Hub persistence / daemon
- `packages/hub-persistence/src/port.ts`, `sqlite.ts`, `memory.ts`, `migrate.ts` — `step_id` on notifications
- `packages/hub-daemon/src/routes/sessions/index.ts` — `active_human_step` on `GET /v1/runs/{id}`
- `packages/hub-daemon/src/routes/phase07/index.ts` — `step_id` in notification wire

### Shell / view-sdk
- `packages/shell-client/src/client.ts`, `types.ts` — `runs.resolveStep`, `active_human_step`, `human_step` notification kind
- `packages/shell-web/src/routes/RunPage.tsx`, `SessionPage.tsx` — ViewCanvasHost from step memos
- `packages/shell-web/src/hooks/useStepCanvasBinding.tsx` — shared canvas binding hook
- `packages/shell-web/src/lib/view-app-context.ts`, `step-view-binding.ts`
- `packages/shell-web/src/routes/NotificationsPage.tsx`, `SpaceHomePage.tsx`
- `packages/view-sdk/src/types.ts`, `app/provider.tsx`, `app/resolve-step.ts` — direct resolve-step submit

### Contracts / docs / tests
- `packages/contracts/src/entities/step-contract.ts` — `presentation.view_ref`
- `studio-specs/current/bridges/step-contract.md` — ViewCanvasHost section
- `apps/docs/guide/tutorials/01-local-preview-review/06-build-views.md` — submit → resolve note
- Tests listed below

## Commands run

```bash
pnpm --filter @murrmure/hub-core test step-memo step-view-ref
pnpm --filter @murrmure/hub-daemon test requires-view resolve-step gates/resolve
pnpm --filter @murrmure/shell-web test RunPage SessionPage ViewCanvasHost
pnpm --filter @murrmure/view-sdk test resolve-step
```

## Manual tester notes

1. Re-apply preview-review v2.2 manifest on murrmuretuto (from VS-2).
2. Mint grant with `step:resolve` (not `gate:resolve` for flow steps).
3. Desktop: full run → intake + review views in ViewCanvasHost (not GatePanel).
4. DevTools iframe: no `token_denied`; assets load via cookie auth.
5. Space home / notifications: “Needs you: {step_id}” when `awaiting_human`.
6. Validate + feedback branches advance via resolve-step (feedback stays on review until VS-7 nested).

## Known gaps (out of VS-3 scope)

- VS-4: late resolve 409, monotonic memos, executor cancel/timeouts
- VS-5: `active-step-contract.json`, `ctx.contract` injection
- VS-7: nested `build.review` loop
- VS-8: delete legacy gate/MCP tools
- Legacy invoke/checkpoint flows still use gates until VS-8 cutover
