# @murrmure/shell-web

## 0.1.1

### Patch Changes

- Updated dependencies [495435e]
- Updated dependencies [82c78fc]
  - @murrmure/view-sdk@0.3.0
  - @murrmure/shell-client@0.2.0

## Unreleased

### Added

- `/sessions/:id` meeting lens: Transcript / Review / Flowchart / Journal tabs.
  Meeting sessions default to Transcript (`GET …/transcript`). A bound View is
  the Review tab and no longer unmounts the transcript. Human chair Close uses
  `sessions.closeMeeting`. No compose box, no `/meetings` route.
- Transcript is a conversation (speaker + bubble), not a journal dump. Flowchart
  and Journal no longer paint under the Transcript tab (`flex` was beating
  `hidden`). Roster uses space slug, not a raw `spc_*` ULID.

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
