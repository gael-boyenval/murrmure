# @murrmure/hub-core

## Unreleased

### Breaking Changes

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

## 0.1.1

### Patch Changes

- Updated dependencies
  - @murrmure/contracts@0.1.1
  - @murrmure/hub-persistence@0.1.1
