# @murrmure/shell-web

## 0.1.1

### Patch Changes

- Updated dependencies [495435e]
- Updated dependencies [82c78fc]
  - @murrmure/view-sdk@0.3.0
  - @murrmure/shell-client@0.2.0

## Unreleased

### Added

- Transcript renders `said` text as Markdown (GFM). **Reply** sets
  `in_reply_to` and targets the sender seat. Shared `xfr_*` refs show a
  name/size card plus a capped text preview. **Expand** opens a modal;
  **Reply** / **Cite** send `in_reply_to` and/or `artifacts`. A right rail
  lists attachments and jumps to the share. Header chevron collapses goal +
  roster.
- Header **Meetings** + **+** button group lists open and closed rooms. **+**
  convenes. Closed rooms **Resume** the same session. Transcript shows Resume
  when the room is closed.
- Space home shows hub `description` (purpose) under the title when present.
- Header **New directive** dialog: prompt, eligible-space checkboxes, fan-out
  `spaces.runFlow('flw_mrmr_directive')`, live results (lifecycle + message +
  session link). No `/directives` route.
- Header **Meetings** lists rooms (`GET /v1/meetings`). Empty Transcript
  preserves the human-chair composer. Flowchart / Journal say when a meeting
  has no bound run.
- Header **+** / New meeting dialog: pick linked spaces + indexed personas, optional
  title/goal, convene with human chair, open Transcript.
- `/sessions/:id` meeting lens: Transcript / Review / Flowchart / Journal tabs.
  Meeting sessions default to Transcript (`GET …/transcript`). A bound View is
  the Review tab and no longer unmounts the transcript. Human chair Close uses
  `sessions.closeMeeting`. No `/meetings` route.
- Transcript is a conversation (speaker + bubble), not a journal dump. Flowchart
  and Journal no longer paint under the Transcript tab (`flex` was beating
  `hidden`). Roster uses space slug, not a raw `spc_*` ULID. Speaker, target,
  and receipt labels use `persona@space`; avatars include both initials so
  several `default` personas remain distinguishable.
- Open Transcripts refresh immediately from meeting journal SSE and poll every
  second as a reconnect fallback. Human chairs can message selected seats or
  everyone. Messages show local time, receipts show delivery latency, and
  replies show elapsed response time. **Agent activity** explains the
  one-process-per-seat lifetime.

### Minor Changes

- The trusted View host validates branch contracts, privately manages upload
  intents, reports aggregate progress, and deterministically cancels
  pre-commit submissions without exposing Hub credentials to the iframe.

## 0.1.2

### Patch Changes

- Updated dependencies
  - @murrmure/shell-client@0.1.1
  - @murrmure/view-sdk@0.2.1

## 0.1.1

### Patch Changes

- Updated dependencies
  - @murrmure/view-sdk@0.2.0
