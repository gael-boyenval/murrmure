# ADR-011 — Space-owned flow admission and apply-quiescence concurrency boundary

**Status:** Accepted
**Date:** 2026-07-15
**Owners:** Contracts, Hub core, Persistence, Daemon
**Task:** [Tutorial v3 Task 09](../plans/2026-07-14-tutorial-v3-build-tasks/09-run-capacity-and-apply-safety.md)

## Context

A space needs deterministic control over concurrent runs of a flow (for example,
the tutorial `my-dev-flow` mutates the repo and must serialize), while unrelated
unbounded flows keep running concurrently. Two prior gaps made this unsafe:

1. **Capacity lived nowhere clean.** The portable flow is resolver-agnostic
   (ADR-007) and carries no execution policy; embedding `max_concurrent_runs` in
   the flow would couple portability to a space's runtime concern. Yet there was
   no space-owned place to declare "at most one non-terminal run of this flow."
2. **Apply could race a run.** Apply replaces a space's whole index atomically,
   but nothing prevented it from replacing configuration while a non-terminal run
   still depended on the current handlers/Views. A run could observe a partially
   replaced index or execute against handlers that were swapped underneath it.
   Concurrent starts could also admit two runs against a limit of one because the
   count-then-insert was not atomic.

The Murrmure ownership boundary requires the answer to be **space-owned** for
capacity and **protocol-owned** for atomicity, without growing the kernel into a
queue, an auto-abort system, or a per-run handler-snapshot store.

## Decision

1. **`run_policies` is space-owned.** `handlers.yaml` carries
   `run_policies: [{ flow, max_concurrent_runs }]`. `flow` is an authored readable
   alias (the applied flow's `name`) resolved at apply to canonical
   `{ origin_space_id, flow_id, flow_digest }`. `max_concurrent_runs` is an
   integer ≥ 1; **no policy means unlimited**. The portable flow never carries
   concurrency policy.
2. **One atomic admission check for every start path.** Every manual, trigger,
   API, MCP, and federated start funnels through a single admission check
   (`admitFlowRun`) that counts the flow's non-terminal runs (`working`,
   `input-required`) against the resolved policy. Overflow creates **no queue and
   no partial run** and returns `409 FLOW_CONCURRENCY_LIMIT` with the canonical
   flow identity, the configured limit, and the active blocking run IDs. A null
   `flow_id` (headless invoke) skips capacity but still holds the guard.
3. **Apply quiescence.** An apply may replace a space's configuration only when
   the **entire space** has no non-terminal runs; otherwise it returns
   `409 SPACE_HAS_ACTIVE_RUNS` with the blocking run IDs and preserves the prior
   index. No force apply, auto-abort, hot swap, migration, or per-run handler
   snapshot is added.
4. **Shared per-space guard.** Run admission (count + insert) and apply
   (quiescence check + candidate build + commit) share one in-process per-space
   mutex (`SpaceConcurrencyGuard`) so a limit of one never admits two, a retried
   trigger performs a fresh admission check, and no run observes a partially
   replaced index. The guard serializes only the brief critical sections; it is
   not held across dispatch, so unbounded flows remain concurrent.
5. **Apply-time resolution and typed denials.** Run-policy aliases resolve against
   the fully merged post-apply flow set (local + bound + preserved). Unknown,
   ambiguous, duplicate, or stale aliases fail apply atomically with typed codes
   (`RUN_POLICY_UNKNOWN_FLOW`, `RUN_POLICY_AMBIGUOUS_FLOW`,
   `RUN_POLICY_DUPLICATE`), preserving the prior index. Trigger delivery records
   the same typed capacity denial as a `mrmr.flow.start_denied` journal event so
   it is observable.
6. **Run identity is pinned.** An admitted run and its journal events carry the
   applied `flow_digest` that was current at admission, so live and historical
   run metadata stays pinned to the configuration it actually used.

## Consequences

- Flows stay portable: the same flow may serialize in one space and run
  unbounded in another, with the policy declared per space.
- A space cannot accidentally run two repo-mutating tutorial flows at once; the
  second start fails fast with the active run IDs instead of disappearing into a
  queue.
- Apply is safe against in-flight runs: an operator cannot swap handlers/Views
  while a run depends on them; apply succeeds immediately once all runs terminate.
- The kernel does not gain a queue, auto-abort, hot swap, or per-run snapshot —
  the boundary is a mutex and two typed 409s, keeping Murrmure a coordination
  layer rather than an execution/runtime platform.
- Capacity denial and apply quiescence are distinguishable to operators and
  support: per-flow at start vs whole-space at apply.

## Enforcement

- `RunPolicySchema` (`max_concurrent_runs` integer ≥ 1, strict) and
  `HandlersFileSchema.run_policies` (defaults to `[]`) gate authoring;
  `ResolvedRunPolicySchema` is the canonical persisted form.
- `resolveRunPolicies` resolves aliases against the merged post-apply flow set and
  returns the typed apply-failure codes; `buildRunPolicyRows` keys rows by
  `flow_id` with `digest = flow_digest`.
- `admitFlowRun` counts non-terminal runs against the policy and returns
  `FLOW_CONCURRENCY_LIMIT` with the active IDs; `assertSpaceQuiescent` returns
  `SPACE_HAS_ACTIVE_RUNS` with the blocking IDs.
- `SpaceConcurrencyGuard` chains per space (bare or prefixed id) and swallows
  failed sections so the chain stays usable; `startFlowRun`, `admitAndCreateRun`,
  `retryRun`, the hook `start_flow` path, the MCP `create_run` path, and the apply
  route all inject the shared `ctx.spaceRunGuard`.
- The flow-starts and sessions routes map `FLOW_CONCURRENCY_LIMIT` to HTTP 409
  with the typed body; the apply route maps `SPACE_HAS_ACTIVE_RUNS` to 409 with
  `active_run_ids`; CLI `mapHubDenial` and the shell-client surface the typed
  code/message.
- An all-start-path atomic concurrency suite proves a limit of one never admits
  two under concurrent starts, no-policy flows stay concurrent, overflow creates
  no queued/partial run, trigger denial is journaled and retry succeeds, apply is
  blocked during non-terminal runs and allowed after termination, and an
  apply/start race shows no partial index.

## References

- [Bridge — Space handlers & contract keys](../current/bridges/handlers.md)
- [ADR-007 — Resolver-agnostic step contracts](./ADR-007-resolver-agnostic-step-contracts.md)
- [ADR-009 — Space-owned view resolvers and hardened host](./ADR-009-space-owned-view-resolver-and-hardened-host.md)
- [Tutorial v3 Task 09](../plans/2026-07-14-tutorial-v3-build-tasks/09-run-capacity-and-apply-safety.md)
