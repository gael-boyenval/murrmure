# @murrmure/hub-daemon

## Unreleased

### Breaking Changes

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
