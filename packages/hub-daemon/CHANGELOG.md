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

### Changed

- Meeting handler dispatch still passes authored `continuation` (including
  `mint_command`) into `shell_spawn`, so Resume after close can reopen the
  same harness chat.
- `GET /v1/sessions/:id/seats` lists roster seats plus live assignment.
  `GET /v1/sessions/:id/seats/:ptc/pty` streams that seat’s PTY (watch-only).

### Fixed

- MCP handshake treats a client `last_ack_seq` ahead of the hub seq as a
  restart (drain from 0) so a live bridge still receives `server_tools`.
- Catalog `inputSchema.type` is always `"object"` (emit-event `oneOf` included).
  Cursor drops the entire tool list otherwise.
- Persistent meeting shells attach a close/write controller to their live seat.
  Later `said` writes the next turn into that PTY. Meeting/run/Hub close shuts
  the PTY down; unexpected exit revokes the seat, preventing false delivery to
  a dead process.
- Meeting child handshakes carry `ses_*` + `ptc_*` and bind only that seat;
  repeated operator handshakes can no longer claim an unmatched assignment.
- Verbose Cursor stream JSON is compacted before terminal meeting action
  journaling, preventing `INLINE_PAYLOAD_EXCEEDED` from stranding the run or
  terminating the Hub through an unhandled completion callback.
- Accepted `mrmr.meeting.said` events now broadcast `journal.append` with the
  meeting `session_id`, so an open shell Transcript refreshes immediately.

### Added

- `GET /v1/sessions/:id/transcript?participant_id=` and MCP
  `murrmure_meeting_transcript` `participant_id` project `you` /
  `addressed_to_you` for that seat.
- `GET /v1/sessions/:id/artifacts/:xfr` (transcript auth) returns meeting
  attachment metadata / `?preview=1` without claiming the sender space.
- `GET /v1/artifacts/:id` accepts `space:read` or `blob:read`. `?preview=1`
  adds a capped text preview for text-like names (not full bytes, not PR/diff).
- `POST /v1/sessions/:id/meeting/resume` reopens the same room and re-wakes seats.
- `GET /v1/meetings` returns open and closed rooms.
- MCP `murrmure_list_directive_eligible` and `murrmure_start_directive` require
  `hub:admin`. Default `local-tools/v1` does not see them. Start fans out
  `POST /v1/flows/flw_mrmr_directive/run`; omit `space_ids` to hit every
  currently eligible space.
- `POST /v1/spaces/:id/apply` copies `bundle.space` `name` / `description` onto
  the hub space row (omitted description clears it) and broadcasts
  `space.list_changed`.
- `GET /v1/directives/eligible` (`space:read`) lists spaces that bind
  `step.opened::directive.execute`. Apply merges the hub-owned directive flow
  into the space index only when that handler is present.
- `GET /v1/runs/:id` includes `result: { step_id, status, message }` from the
  resolved step output.
- MCP `murrmure_put_artifact` (`blob:write`) uploads inline `content`+`name`
  (64 KiB) or a space-relative `path` and returns `xfr_*`. Meeting attach is
  put → `said` with `artifacts` → peer `get_artifact`.
- MCP `murrmure_get_artifact` materializes an ACL-authorized `xfr_*` into the
  authenticated space's local inbox and returns safe verified metadata +
  relative `local_path` without exposing ACL readers; `artifact_id` is accepted
  as an input alias for canonical `transfer_id`.
- Flow `meeting:` step: opening `decide` convenes on the run session; HTTP /
  emit close resolves the bound step and advances the run. Apply passes
  catalog meeting step ids into handler-binding validation.
- `POST /v1/meetings`, human-chair `POST /v1/sessions/:id/meeting/say`, and
  `/meeting/close` convene, talk in, and close rooms. Convene wakes seats.
  `GET /v1/meetings` lists open rooms. MCP `murrmure_start_meeting` mirrors
  convene (`flow:run`).
- `GET /v1/sessions/:id/transcript` and MCP `murrmure_meeting_transcript`
  return the meeting projection. Auth is roster space or `journal:read` on a
  roster space. Meeting wakes pass ids + `since_seq` only.
- Live map `(session_id, participant_id)` plus `murrmure/control.meeting_said`.
  Active-process `said` notifies the recorded principal (`publishToPrincipal`),
  not `publishToSpace`. `shell_spawn` seats bind the **child** MCP when it
  connects (queue until then), and revoke that binding when the child exits.
  Assignment-mode MCP must not drop this method.
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
