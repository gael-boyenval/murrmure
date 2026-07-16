# @murrmure/hub-core

## 0.1.2

### Patch Changes

- Updated dependencies [495435e]
- Updated dependencies [82c78fc]
  - @murrmure/contracts@0.2.0
  - @murrmure/hub-persistence@0.1.2

## Unreleased

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
