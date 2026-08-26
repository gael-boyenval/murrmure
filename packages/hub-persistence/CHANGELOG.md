# @murrmure/hub-persistence

## 0.1.2

### Patch Changes

- Updated dependencies [495435e]
- Updated dependencies [82c78fc]
  - @murrmure/contracts@0.2.0

## Unreleased

### Fixed

- Existing hubs can migrate: `idx_journal_index_meeting_seq` is created after
  `ALTER TABLE journal_index ADD COLUMN meeting_seq`, not in the bootstrap
  `CREATE TABLE IF NOT EXISTS` blob (that index crashed desktop on old DBs).

### Added

- `listMeetings()` returns open and closed meeting snapshots (`updated_at` desc).
- Meeting snapshot port: `meeting_sessions`, `meeting_seq_counters`, nullable
  `journal_index.meeting_seq`, plus `getMeetingBySession`, `listOpenMeetings`,
  `upsertMeetingSnapshot`, `allocateMeetingSeq`, `queryMeetingJournal`, and
  `updateArtifactAuthorizedReaders`.
- `listIndexedRunPolicies(space_id)` on `StudioPersistencePort` returns the
  space's resolved run policies.
- In-memory and SQLite persistence store `run_policies` in the space index
  snapshot; SQLite adds a `space_run_policies` table keyed by
  `(space_id, flow_id)`.

## 0.1.1

### Patch Changes

- Updated dependencies
  - @murrmure/contracts@0.1.1
