# @murrmure/contracts

## Unreleased

### Added

- `RunPolicySchema` and `HandlersFileSchema.run_policies` (defaults to `[]`) for
  space-owned `{ flow, max_concurrent_runs }` run-capacity policies.
- `ResolvedRunPolicySchema` — the canonical persisted form
  `{ flow, max_concurrent_runs, origin_space_id, flow_id, flow_digest }`.
- Run-capacity error codes `FLOW_CONCURRENCY_LIMIT`, `SPACE_HAS_ACTIVE_RUNS`,
  `RUN_POLICY_UNKNOWN_FLOW`, `RUN_POLICY_AMBIGUOUS_FLOW`, `RUN_POLICY_DUPLICATE`.
- Journal event type `FLOW_START_DENIED` (`mrmr.flow.start_denied`) for
  observable trigger-denied flow starts.
- `SpaceIndexSnapshot.run_policies`, `ApplyIndexChange.resource: "run_policies"`,
  and `ApplyIndexResult.summary.run_policies`.

### Breaking Changes

- Branch catalog entries now own `payload_required`, `artifact_required`, and
  branch-local artifact slots; the merged step-level slot union is removed.
  Added shared Draft 2020-12 validation and normalized contract errors.

## 0.1.1

### Patch Changes

- Publish view-sdk dependency chain to npm with registry semver deps (no `workspace:*`).

  - `@murrmure/contracts` and `@murrmure/shell-client` are public packages with Trusted Publisher
  - `@murrmure/view-sdk` pins `^0.1.x` registry deps for external view scaffolds
