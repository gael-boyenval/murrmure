# 09 — Enforce run capacity and safe apply

**Status:** Ready  
**Build order:** 09  
**Depends on:** 03, 04  
**Source work packages:** T05 run policy/apply subset

## Goal

Give a space deterministic control over concurrent runs while preserving immutable applied configuration: the tutorial flow admits one active run, unrelated unbounded flows may run concurrently, and no apply can replace configuration while any run in the space is non-terminal.

## User stories

- As a space owner, I serialize repository-mutating tutorial runs without adding execution policy to the portable flow.
- As a user, an over-capacity start fails immediately with the active blocking runs instead of disappearing into a queue.
- As an operator, I cannot apply new handlers/Views while an existing run still relies on the current configuration.
- As a user of another flow, I can still run concurrently when no policy limits it.
- As support, I can distinguish flow capacity from space apply quiescence.

## Contracts

- `handlers.yaml` owns `run_policies: [{ flow, max_concurrent_runs }]`.
- `flow` is an authored readable alias resolved during apply to canonical `{origin_space_id, flow_id, flow_digest}`.
- `max_concurrent_runs` is an integer ≥ 1; duplicate, unknown, ambiguous, or stale aliases fail apply. No policy means unlimited.
- Every manual, trigger, API, MCP, and federated start uses one atomic admission check.
- Overflow creates no queue/run and returns `409 FLOW_CONCURRENCY_LIMIT` with canonical flow identity, configured limit, and active blocking run IDs.
- Trigger delivery records the same typed denial. Retry always performs a fresh admission check.
- Apply is allowed only when the entire space has no non-terminal runs.
- Apply conflict returns `409 SPACE_HAS_ACTIVE_RUNS` with blocking run IDs.
- Apply and run start share a per-space guard so no run observes a partially replaced index.
- No force apply, auto-abort, hot swap, migration, or per-run handler snapshot is added.

## Implementation

- Add run policy schema, alias resolution, indexing, and canonical persistence.
- Add shared atomic admission service to every start adapter.
- Add observable trigger-denial and retry behavior.
- Add apply/run-start guard around candidate build/commit and run admission.
- Preserve immutable applied digest for admitted runs and record policy/config identity.
- Configure tutorial `my-dev-flow` with `max_concurrent_runs: 1`.
- Surface typed errors consistently in CLI, Desktop, API, MCP, and operator state.

## Testing

### Automated

- Schema/apply tests for valid values, absent policy, duplicates, unknown/ambiguous/stale aliases, rename, origin separation, and digest changes.
- Atomic races across all start paths prove a limit of one never admits two.
- No-policy flow admits concurrent runs; higher limits enforce exact boundaries.
- Overflow creates no queued/partial run and returns active IDs.
- Trigger denial is journaled/observable and later retry succeeds.
- Apply blocked for open/running/cancelling runs and allowed immediately after all become terminal.
- Apply/start races prove exactly one operation wins and no partial index is visible.
- Live/historical run metadata remains pinned to admitted digest.

### Manual

- Start the tutorial flow, attempt a second start from CLI and Desktop, inspect `FLOW_CONCURRENCY_LIMIT`, finish/cancel, and retry successfully.
- Start an unrelated unlimited flow during the tutorial run.
- Attempt apply during the run, inspect `SPACE_HAS_ACTIVE_RUNS`, then apply after termination.
- Race one start and one apply and inspect the resulting run/config identity.

## Documentation, skills, specs, and ADRs

- **ADR required:** space-owned flow admission and apply-quiescence concurrency boundary.
- **Normative specs:** handler/run policy, Hub/CLI error contracts, apply atomicity, run identity.
- **User docs:** `space-handlers.md`, run/apply troubleshooting.
- **Tutorial:** Part 5 policy plus Parts 4/6 retry/apply expectations.
- **Skills:** handler/space policy authoring and operator recovery.
- **Scaffolds/examples:** tutorial handlers; do not add policy to portable flow templates.
- **Enforcement:** all-start-path atomic concurrency suite.
- **Changelog:** run policy, typed capacity denial, and active-run apply rejection.

## References

- [Handler authoring simplification](../2026-07-10-handler-authoring-simplify.md)
- [Coordinating plan T05](../2026-07-13-tutorial-v3-full-alignment.md)
- [Tutorial Part 5](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/05-extend-flow-and-handlers.md)
- [Space handlers guide](../../../apps/docs/guide/space-handlers.md)

## Done gate

- Tutorial admits at most one non-terminal run and queues nothing.
- Unbounded flows remain concurrent.
- Every start path enforces identical policy and errors.
- Apply cannot replace configuration during any non-terminal run.
- Runs and journals pin the configuration they actually used.
- Portable flows contain no concurrency policy.

## Handoff

| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | gpt-5.6-sol-high | complete | Assessed Task 09 at HEAD `c81b42d`. The bulk of the implementation was co-committed in `495435e` under Task 05: run-policy schema/resolution/indexing, atomic flow admission, apply quiescence, the shared space guard, typed CLI/API/client errors, trigger-denial journaling, tutorial policy, ADR-011, docs/skills/changelogs, and focused tests. This turn closed the remaining apply/start races by resolving and preparing the canonical indexed flow inside the shared guard, routing headless API, hook/handler, and orchestration-attach run creation through that guard, pinning the applied index digest rather than the compiled-IR or caller-supplied digest, and returning every active blocker ID; added focused regression coverage; and synced the HTTP API reference. | Done gate satisfied. Task 09 focused suites: 6 files, 46 tests passed (`run-policy` 16, `admission` 10, `run-capacity-races` 6, `space-guard` 5, HTTP `run-capacity` 5, HTTP `apply-quiescence` 4). Digest-preparation unit regressions: 10 passed. Guard-adapter regressions: 4 passed, 4 pre-existing orchestration tests skipped. `@murrmure/hub-core` and `@murrmure/hub-daemon` typechecks passed; edited-file lints clean. | Review Task 09 separately; this turn intentionally performed build completion only, not a full review. |

