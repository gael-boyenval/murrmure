# @murrmure/shell-client

## Unreleased

### Added

- `runFlow` now raises a structured `ShellClientHttpError` (with typed
  `code`, `message`, `active_run_ids`, `max_concurrent_runs`) on non-2xx
  responses so the Desktop shell can surface `FLOW_CONCURRENCY_LIMIT` and
  `SPACE_HAS_ACTIVE_RUNS` denials.

- Added private trusted-host upload-intent creation, raw file transfer,
  cancellation, and structured HTTP contract errors.

## 0.1.1

### Patch Changes

- Publish view-sdk dependency chain to npm with registry semver deps (no `workspace:*`).

  - `@murrmure/contracts` and `@murrmure/shell-client` are public packages with Trusted Publisher
  - `@murrmure/view-sdk` pins `^0.1.x` registry deps for external view scaffolds

- Updated dependencies
  - @murrmure/contracts@0.1.1
