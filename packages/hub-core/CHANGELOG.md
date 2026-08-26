# @murrmure/hub-core

## 0.1.2

### Patch Changes

- Updated dependencies [495435e]
- Updated dependencies [82c78fc]
  - @murrmure/contracts@0.2.0
  - @murrmure/hub-persistence@0.1.2

## Unreleased

### Fixed

- Meeting/hook runs persist `exec_context` (stdout, spawn) without a flow
  binding. Agent activity can show seat output.
- `murrmure_emit_event` catalog schema now sets `type: "object"` on multi-event
  `oneOf`. Cursor otherwise rejects the whole tool list (0 tools enabled).
- `shell_spawn` meeting seats are registered before invocation. A fast first
  `said` can no longer recursively spawn the same seat or create a false
  `EXECUTOR_UNAVAILABLE` receipt.
- Live meeting assignments use roster `participant_id`, so equal persona names
  in different spaces no longer overwrite each other.

### Changed

- Meeting seat operating rules: pull transcript with this `participant_id`,
  read `you` / `addressed_to_you`, and do requested work on the turn instead
  of status-only replies.
- Meeting `said` artifacts add `actor:{session.actor_id}` to
  `authorized_readers` (human chair preview) plus roster spaces.
- Default artifact TTL is 90 days (`DEFAULT_ARTIFACT_TTL_DAYS`). Existing
  rows keep their stored `expires_at`. Put may still set `ttl_days`.
- Meeting wake envelope includes session `subject` (convene goal) so seats
  skip `murrmure_get_session` on first turn.
- Meeting seats start one persistent assignment/process on convene. Later
  messages write the next turn into that PTY (`notify_live` → controller).
  Queued writes flush after idle. Convene prompts require one contribution;
  later turns allow concise, targeted silence.
- Persistent `shell_spawn` may declare `continuation.mint_command`; apply
  validates that template the same as `continuation.command`.

### Added

- Meeting transcript reader projection: `you`, `from.label`, `addressed_to_you`
  when the caller passes a roster `participant_id`.
- `resumeMeeting` reopens a closed room (same `ses_*` + `ptc_*`), journals
  `mrmr.meeting.resumed`, and re-wakes said handlers with `trigger: resumed`.
- `GET` meeting list includes closed rooms and roster seats.
- Platform flow `flw_mrmr_directive`: compiled at boot, merged into a space
  index only when a handler binds `step.opened::directive.execute`.
  `listEligibleDirectiveSpaces` / `extractRunStepResult` for the operator
  eligible list and run-detail message.
- Step-handler dispatch passes run `input` into invoke params so
  `{{input.prompt}}` interpolates (same convention as flow templates).
- Convene wakes roster seats (`mrmr.meeting.convened` rings a `said` handler).
  `toMeetingListRow` / `listOpenMeetings` for the operator meeting list.
- `meeting:` flow step: compile copies the facet onto the catalog entry;
  `openStepContract` convenes on this `session_id` and writes `bound_run_id` /
  `bound_step_id`; close (HTTP or `MEETING_CLOSED` emit) calls
  `resolveFlowStep` (`failed` if `data.failed: true`). Apply rejects
  `view_resolver` and `complete: auto` on that step.
- Meeting room protocol: `conveneMeeting`, `prepareMeetingSaid`,
  `closeMeeting`, `appendMeetingEvent`, receipts, and
  `dispatchMeetingSaidTargets`. `emitAndDeliver` runs said/closed validators
  before journal and fans out only to resolved targets. Convene unions
  `spaces_touched` with every roster space.
- `buildMeetingTranscript` folds `mrmr.meeting.*` on session-monotonic
  `meeting_seq`, preserving message/receipt timestamps and computing delivery
  latency. Human-chair messages project as `from: { human: true }`. Seat wakes use `renderMurrmureMeetingProtocolEnvelope`
  (`murrmure.meeting/v1`) — trigger ids + `since_seq`, not the step envelope.
- Journal-first `emitAndDeliver` and `resolveEventDeliveryTarget` (`create` |
  `attach` | `notify_live`). Event handlers with a live `session_id` attach
  instead of minting a new session. `eventExecContext` no longer spreads the
  full payload into run input.
- `LiveAssignmentPort` (`findLive` / `start` / `notify` / `revoke`) keyed by
  roster participant. A currently live seat's later `said` is `notify_live`;
  process completion and room close revoke the live map.

### Added

- Space-owned run-capacity admission: `admitFlowRun` counts a flow's
  non-terminal runs against its resolved `max_concurrent_runs` policy and
  returns `FLOW_CONCURRENCY_LIMIT` with the active run IDs on overflow;
  `assertSpaceQuiescent` returns `SPACE_HAS_ACTIVE_RUNS` when a space has
  non-terminal runs.
- `SpaceConcurrencyGuard` — a per-space async mutex shared by run start and
  apply so admission (count + insert) and apply (quiescence + commit) are
  atomic.
- `resolveRunPolicies` / `buildRunPolicyRows` resolve authored aliases to
  canonical policies against the merged post-apply flow set with typed
  `RUN_POLICY_*` apply failures.
- `startFlowRun`, `admitAndCreateRun`, and `retryRun` wrap admission + run
  creation in the shared guard; run rows and journal events pin the admitted
  `flow_digest`.

### Breaking Changes

- Resolve now authoritatively validates the selected branch's payload and
  artifacts, including file-only requirements, Draft 2020-12 schemas, MIME,
  extension, byte/cardinality limits, and normalized errors. Promoted run
  artifacts use `.mrmr/dev/runs` and transfer staging is deleted.
- `FlowManifestSchema` is strict: `triggers` is the only start-condition field.
  `start`, `requires_view`, `role`, `presentation`, `deriveRole`, wait kinds,
  and legacy step kinds (`invoke`/`checkpoint`/`gate`) are rejected at parse
  time with specific codes (`LEGACY_START_KEY`, `LEGACY_REQUIRES_VIEW`,
  `LEGACY_STEP_KIND`). Plain steps receive injected `completed`/`failed` default
  branches; explicit non-empty branch maps are exact. Branch routing is flat
  (`route: { step | run }`, `resume: <ancestor>`). Run projections expose
  generic `open_steps[]` with `resolver: null` instead of
  `awaiting_human`/`active_human_step`. Manual start eligibility requires
  `triggers.manual === true` (invoke-only when absent).
- Removed implicit package-catalog installs; install now requires an explicit
  bundle. New space IDs are opaque and independent from editable slugs.

### Changed

- `HubHandler.handleGateResolve` no longer bridges to the kernel
  `checkpoint.resolve` command. It now delegates to the orchestration gate
  service `resolveGate` (`src/gates/service.ts`) — the same path as
  `POST /v1/gates/:gate_id/resolve` (phase07, `flow:run` authz). A `gate.resolve`
  whose `gate_id` derives from a kernel checkpoint is denied `gate_not_found`
  (404); the kernel checkpoint stays pending. Dead `checkpoint_vote_denied` /
  `checkpoint_resolved` mappings removed from `src/bridge/errors.ts`.
- `resolveGate` (`src/gates/service.ts`) enforces a space boundary when the
  caller passes `space_id`: a `flow:run` token may only resolve a gate in its
  own space; bootstrap and `hub:admin` tokens may resolve cross-space. A
  mismatch yields `SCOPE_ENFORCEMENT_FAILURE` (403). `GateResolveInput` gains an
  optional `space_id` field.

### Fixed

- `HubHandler.handleGateResolve` now forwards `cmd.provenance.space_id` into
  `resolveGate`'s `GateResolveInput.space_id`. Previously it omitted the field,
  so a `flow:run` token scoped to space A could resolve a gate belonging to
  space B by supplying its `gate_id` (the path-token check passed because the
  provenance path was space A). The space boundary is now enforced on the
  command path, matching `POST /v1/gates/:gate_id/resolve`.

## 0.1.1

### Patch Changes

- Updated dependencies
  - @murrmure/contracts@0.1.1
  - @murrmure/hub-persistence@0.1.1
