# @murrmure/hub-daemon

## 0.1.2

### Patch Changes

- Updated dependencies [495435e]
- Updated dependencies [82c78fc]
  - @murrmure/contracts@0.2.0
  - @murrmure/executors@0.1.1
  - @murrmure/hub-core@0.1.2
  - @murrmure/hub-persistence@0.1.2

## Unreleased

### Added

- Flow `meeting:` step: opening `decide` convenes on the run session; HTTP /
  emit close resolves the bound step and advances the run. Apply passes
  catalog meeting step ids into handler-binding validation.
- `POST /v1/meetings` and `POST /v1/sessions/:id/meeting/close` convene and
  close rooms. MCP `murrmure_start_meeting` mirrors convene (`flow:run`).
- `GET /v1/sessions/:id/transcript` and MCP `murrmure_meeting_transcript`
  return the meeting projection. Auth is roster space or `journal:read` on a
  roster space. Meeting wakes pass ids + `since_seq` only.
- Join-once live map `(session_id, persona)` plus `murrmure/control.meeting_said`.
  Later `said` notifies the recorded principal (`publishToPrincipal`), not
  `publishToSpace`. Assignment-mode MCP must not drop this method.
- `POST /v1/spaces/:id/events` (no `instance_id`) requires `event:emit`,
  journals first via `emitAndDeliver`, and returns the real journal `seq`.
  `murrmure_emit_event` forwards top-level `session_id`. Meeting types without
  `session_id` return `400 MEETING_SESSION_REQUIRED`. Hub-authored meeting
  types are denied.

### Added

- Run-capacity admission and apply quiescence wired through every start path
  (flow-starts route, MCP `create_run`, hook `start_flow`, event triggers,
  flow-call, retry) and the space apply route, all sharing `ctx.spaceRunGuard`.
- `409 FLOW_CONCURRENCY_LIMIT` on overflow with canonical flow identity, limit,
  and active run IDs; `409 SPACE_HAS_ACTIVE_RUNS` on apply conflict with
  blocking run IDs; typed `RUN_POLICY_*` apply failures preserve the prior
  index.
- Event-triggered flow starts that are denied at capacity append a
  `mrmr.flow.start_denied` journal event.

### Breaking Changes

- Removed JSON/base64 step work uploads. The Hub now issues actor- and
  idempotency-bound upload intents before raw bytes, enforces fixed quotas and
  one-hour idle leases, sweeps abandoned uploads, consumes intents with resolve,
  and persists sanitized attempt diagnostics.
- The space apply route parses each flow manifest before bundle validation and
  surfaces specific legacy codes (`LEGACY_START_KEY`, `LEGACY_REQUIRES_VIEW`,
  `LEGACY_STEP_KIND`) instead of a generic `INVALID_APPLY_BUNDLE`. Removed
  `requires_view`/`active_human_step`/`awaiting_human` from flow index and run
  projections in favor of generic `open_steps[]` with `resolver: null`.
- Hub startup no longer reads or pins bundled contract fixtures. Tests install
  required contracts explicitly from `test-utils/`.

## 0.1.1

### Patch Changes

- Updated dependencies
  - @murrmure/contracts@0.1.1
  - @murrmure/executors@0.1.0
  - @murrmure/hub-core@0.1.1
  - @murrmure/hub-persistence@0.1.1
