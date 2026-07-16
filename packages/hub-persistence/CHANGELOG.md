# @murrmure/hub-persistence

## Unreleased

### Added

- `listIndexedRunPolicies(space_id)` on `StudioPersistencePort` returns the
  space's resolved run policies.
- In-memory and SQLite persistence store `run_policies` in the space index
  snapshot; SQLite adds a `space_run_policies` table keyed by
  `(space_id, flow_id)`.

## 0.1.1

### Patch Changes

- Updated dependencies
  - @murrmure/contracts@0.1.1
