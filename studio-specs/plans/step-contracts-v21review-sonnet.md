# Review — Step Contracts v2.1 (Unified State Machine)

**Reviewer:** Sonnet reviewer
**Reviewed:** `studio-specs/plans/2026-07-07-step-contracts-unified-state-machine.md`
**Cross-read:** `studio-specs/current/product/spec.md`, `studio-specs/current/bridges/flow-engine.md`, `studio-specs/current/bridges/action-invoke.md`, `examples/flows/preview-review-v2/*`
**Brief:** owner wants the simplest possible foundation, is comfortable with breaking changes, and explicitly does **not** want old-compatibility code carried forward.

---

## Summary

The diagnosis in v2.1 is correct and worth acting on: `invoke` and `checkpoint` steps really are the same thing (a contract waiting for a resolution) wearing two costumes, and Tutorial 1's failures (agent doesn't know it's done, failure doesn't hard-stop, hybrid `build` step straddling two completion models) are symptoms of that split. The "one state machine, many fulfillers" thesis is the right frame, and the engine invariants (single advance path, fail-fast, monotonic memos, schema validation) are good normative anchors that should ship regardless of what happens to the rest of the doc.

However, the *design* built on top of that correct diagnosis does not yet deliver on the owner's brief. It (1) explicitly re-introduces the two-YAML-shape problem it set out to kill (D8), (2) plans a multi-phase migration with aliases, shims, and dual-write journal events the owner said not to build, (3) adds a new nested-step primitive (qualified IDs, sequencing invariants, a new "who calls invoke_step" ceremony) whose value over a flat cyclic graph is asserted rather than demonstrated, and (4) leaves several load-bearing terms (branch vs. route vs. the already-shipped `disposition`, the fate of the `Gate` entity, which function actually owns "advance") undefined despite the doc being staged to become normative. The nested model also introduces a new reliability regression relative to what's shipped today: it moves "who opens the next step" from an engine guarantee to an agent-remembered MCP call for every child after the first, which cuts directly against I1/I2, the problems the spec exists to fix.

Net recommendation: keep the diagnosis and the engine invariants; do not keep D8, the migration aliases, or dual-write; and run a real spike of the flat-graph alternative (sketched below) before committing to nested steps as a protocol primitive.

---

## Inconsistencies found

1. **D8 directly contradicts the owner's mandate.** "Author recommendation: Unify runtime first; keep `invoke`/`checkpoint` YAML sugar; index lowers to contract IR" (Summary, D8) reinstates the exact dual-shape problem I4 names as a root issue ("Two YAML shapes... despite humans using ViewCanvasHost for both"). The owner's brief says no old-compatibility code and no fear of breaking changes. There is exactly one example flow and one tutorial in the repo today — the cost of a clean cutover is close to zero. Keeping sugar here isn't caution, it's the thing being reviewed against.

2. **The "Mapping from current v2 (migration)" section and Phase 2–3 plan build the compatibility layer the owner rejected.** Alias tools (`murrmure_complete_action` → `murrmure_resolve_step`, `murrmure_wait_for_gate` → `murrmure_wait_for_step`), an HTTP shim (`/v1/gates/{id}/resolve` → unified resolve), and **dual-write journal events** ("Journal event: `mrmr.step.resolved`... dual-write legacy events during migration", repeated in Phase 3) are all "old compatibility code" by the owner's own definition. Given the shipped surface is one example flow, these should be a single atomic cutover PR, not a deprecate-over-a-release strategy.

3. **Sequencing invariant vs. non-linear `goto` is internally strained.** The doc states "declaration order is not execution order" for nested children, then defines the prerequisite check as "the **previous child in the activation chain**" (§ Sequencing invariant, error example `STEP_PREREQUISITE_INCOMPLETE`). In the non-linear example (`build-loop` / `scope-check` / `review` / `security-scan`), there is no single "previous in chain" — `review` can `goto` either `build-loop` or `scope-check` depending on branch, and `security-scan` is declared but never targeted by any `goto` in the example, so it's dead code in the sample manifest. "Previous in chain" needs a precise definition (last-activated sibling? last-terminal sibling?) before it can be a linter rule, and the example should either wire `security-scan` in or be dropped.

4. **Three vocabularies for the same concept, none reconciled.** v2.1 introduces `branch` (contract outcome) and `route` (`complete`/`continue`/`goto`/`fail`). The currently shipped runtime (per `bridges/flow-engine.md` "Checkpoint runtime") uses `disposition: continue | cancel` on resolve, plus the existing manifest's `on_resolve.when` / `values` keyed by domain strings (`validated`, `changes_required`). The migration table never maps `disposition` to `branch`, and nowhere does the doc say whether `disposition` survives, is folded into `branch`, or is deleted. For a document that Phase 1 promises to split into a *normative* bridge (`step-contract.md`), this is a real gap, not a stylistic one.

5. **`Gate` entity fate is undecided, and the "one state machine" thesis is undercut by it.** `product/spec.md` §6.1 defines `Gate` with its own `status: pending|approved|rejected|expired` and `resolve_mode`, independent of `RunStepMemo.status`. v2.1's only statement on this is a shim route ("`POST /v1/gates/{gate_id}/resolve` → lookup gate's bound `step_id` → unified resolve"), which implies the `gates` table and its parallel status enum keep existing beside step memos. That is two state machines for one human-checkpoint concept — exactly what "one state machine, many fulfillers" claims to avoid. The doc's own review-goal list asks "drop gates table?" but the design section never answers it.

6. **"Single advance path" is asserted, not designed.** Engine invariant #1 says one function applies routes and dispatches next steps. Today that logic is split across `advance-runner.ts`, `advance.ts`, `checkpoint-dispatch.ts`, `checkpoint-resolve.ts`, `checkpoint-runner.ts`, and `join.ts` (per `bridges/flow-engine.md`). Phase 3 ("single advance runner; deprecate split checkpoint/invoke advance paths") happens *after* Phase 1 (token injection) and Phase 2 (explicit resolve), meaning injection and explicit-resolve work gets built once against the old split paths and then again against the merged one. Sequencing this after the split-path work it's meant to obsolete produces avoidable rework.

7. **Reliability regression hidden inside the fix for reliability.** I1/I2 exist because agents don't reliably signal completion and failures don't hard-stop. But the nested lifecycle example (§ Lifecycle) requires the agent to explicitly call `murrmure_invoke_step(build.review, …)` to open the second child — "fails if (4) skipped." Today, the engine opens the next step automatically on advance (`createPendingGate` on checkpoint entry, per the flow-engine bridge); only the *first* nested child gets that same automatic treatment under v2.1 (D7). Every subsequent child now depends on the agent remembering an extra MCP call the current top-level model doesn't require. That's a new way for a run to silently stall — the same failure mode class this spec exists to close.

---

## Simplification opportunities (ranked by impact)

1. **Drop D8 outright — one step shape, no sugar.** Ship a single `step:` block (branches, schema, routes, optional `presentation`, optional `executor`) from day one. There is no installed base of `invoke`/`checkpoint` manifests to protect beyond one example flow; rewrite it in the same PR. This alone removes the dual-YAML, dual-indexer-path, dual-lint-rule surface that motivated the whole spec.

2. **No aliases, no shims, no dual-write — one atomic cutover.** Delete `murrmure_complete_action`, `murrmure_wait_for_gate`, and `/v1/gates/:id/resolve` in the same change that ships `resolve_step`/`invoke_step`/`wait_for_step`. Update the one example flow, its skill, and its agent.md in the same PR instead of running two systems in parallel for "one release." Emit only `mrmr.step.resolved` — no dual-write of legacy gate/action-completed events. This is the single highest-leverage move for matching the owner's stated risk tolerance.

3. **Decide the `Gate` entity now, not later.** Delete the `gates` table and its independent status enum. A human checkpoint is a step contract whose `presentation.view` is set and whose branch resolution comes from a view `submit`; `assignees` and `expires_at` become fields on the step contract/memo, not a second entity. Notifications and the gate inbox become a *query* over step memos (`status = input-required AND presentation IS NOT NULL`), not a join to a separate table with its own lifecycle. This directly answers the review brief's "drop gates table?" question — the design should say yes.

4. **Spike "flat graph + cycles" before committing to nested steps.** The concrete need behind nesting (build-loop ⇄ review without spawning a new agent process) is already achievable today with the flat model: the *current* `preview-review` manifest already loops `review: { changes_required: { goto: review } }` at the top level. Generalize that: make `build-loop` and `review` ordinary top-level steps connected by `goto` cycles, and skip qualified IDs, "one active child" invariants, and the new `invoke_step`/`wait_for_step` ceremony entirely. The only thing nesting buys over this is *visual* collapsing of implementation-detail steps in the flow preview — solve that with an optional `group:` display hint consumed by the (admin-only) flowchart renderer, not a new protocol primitive with its own state machine rules. This is the single biggest complexity-reduction opportunity in the whole spec and deserves a real prototype before Phase 4 is scheduled.

5. **One advance function, built first, not third.** Re-sequence the phases: merge `advance-runner`/`checkpoint-runner`/`join` into the single step-kind-agnostic advance function *before* building token injection or nested sequencing on top of it. Otherwise Phase 1–2 work is written against machinery Phase 3 throws away.

6. **Collapse `invoke_step` + `wait_for_step` into `resolve_step`'s response for the common case.** In the modal example, the agent's three calls per loop iteration (`resolve_step(build-loop)`, `invoke_step(review)`, `wait_for_step(review)`) can become two: `resolve_step` accepts an optional `open_next` hint (or the engine just auto-opens the sole eligible next step when there is only one `working`/`input-required` slot available, which the "one active child" invariant already guarantees is unambiguous). Reserve an explicit "open" call only for genuine multi-way branches where the engine cannot infer which sibling to activate.

---

## Alternative foundation sketch (YAML + lifecycle in ~30 lines)

```yaml
# One step shape. No invoke/checkpoint split. No nesting primitive.
# Loops are just steps whose branch routes back to an earlier step id.
steps:
  - id: build
    executor: { action: feature_build }
    branches:
      completed: { next: review }
      failed: { next: null }        # null + failure branch => run.failed

  - id: review
    presentation: { view: preview-review, assignees: ["{{input.reviewer}}"] }
    branches:
      validated: { next: archive }
      changes_required: { next: build }
      cancelled: { next: null }     # null + cancel branch => run.cancelled

  - id: archive
    executor: { action: feature_archive }
    branches:
      completed: { next: commit }
```

```text
function resolve(run, step_id, branch, payload, artifacts):
  assert run.lifecycle not in TERMINAL
  step = run.flow.steps[step_id]
  assert step.status in [working, input-required]
  validate(payload, step.branches[branch].schema)
  memo[step_id] = terminal(status=branch, payload, artifacts)   # monotonic
  journal.emit(mrmr.step.resolved, {step_id, branch, payload_hash, artifact_digests})
  next_id = step.branches[branch].next
  if next_id is null:
    run.lifecycle = branch in FAILURE_BRANCHES ? failed : (branch in CANCEL ? cancelled : completed)
    return
  open(run, next_id)

function open(run, step_id):
  step = run.flow.steps[step_id]
  memo[step_id] = { status: step.presentation ? "input-required" : "working" }
  if step.executor: dispatch(step.executor, run, step_id)     # engine-driven, always
  if step.presentation: create_gate_projection(step, run)      # not a new entity
  journal.emit(mrmr.step.opened, {step_id})
```

Everything the v2.1 doc wants — one resolve endpoint, one advance function, one journal event, schema/artifact validation, monotonic memos, fail-fast — falls out of this without qualified IDs, sequencing invariants, `invoke_step`, or a `Gate` entity. If nesting is later proven necessary by the spike in simplification #4, it can be added as sugar that *compiles down* to this flat cyclic graph (qualify the id, keep the loop-by-`next` semantics) rather than as a runtime concept with its own rules.

---

## Conflicts with product north star

- **No hard violation, but a prioritization risk.** The north star reserves the flowchart as admin/operator tooling, not the product surface. The spec's "Observability (flow preview)" and "Nested preview renders goto edges, not YAML list order" sections stage real engineering investment (non-linear edge rendering, qualified-ID overlays) into that admin surface. That's legitimate scope for admin tooling, but it should not be prioritized ahead of the kernel reliability fixes (Phase 0) that the north star's "protocol as kernel" framing actually depends on. Keep Phase 0 first as the doc already states (D11) — just don't let nested-step observability work expand to compete with it.
- **Consistent where it matters.** The doc correctly keeps `build.review` opening full `ViewCanvasHost`, with shell as fallback only when no view is bound — that's the one place this spec touches human UX, and it gets it right.
- **Tension with "skills become thin."** The doc claims "Skills become thin (\"follow injected contract\"); manifest + index are source of truth," but the actual skill/agent surface grows: three MCP tools instead of two, qualified IDs, new error codes (`STEP_PREREQUISITE_INCOMPLETE`), and per-child injection atoms the author must reference correctly in prompts. Thin skills require a genuinely smaller agent-facing API, which argues again for simplification #4 and #6 above.

---

## Tutorial 1 / preview-review — does nesting actually simplify build.review?

Reading the *current* shipped `preview-review-v2` example (`agent.md`, `skills/feature-build/SKILL.md`, `flow.manifest.yaml`) against the proposal: today, one long-lived shell process backing the top-level `build` step calls `murrmure_complete_action` once, then loops `murrmure_wait_for_gate` against the separate top-level `review` checkpoint — the exact "hybrid" pattern I1 flags as confusing (a process outlives its own step's completion to drive the next step). The nested model formalizes this intent (parent `build` owns children `build-loop` and `review`), which is a genuine clarity win for *documentation* purposes.

But it does **not** clearly simplify the agent's actual job: the agent still needs to know it must keep running past `build-loop`'s resolution, still needs to distinguish "resolve" from "invoke" from "wait," and now also needs to satisfy sequencing invariants and qualified-ID addressing it didn't need before. And as noted in inconsistency #7, it removes the automatic-open guarantee for the second child, adding a failure mode. The flat, cyclic alternative above reproduces the same author intent (`build` ⇄ `review` until validated, then `archive`) with strictly fewer new concepts than nested steps require, while still fixing the real problem (one contract shape, one resolve call, engine always opens what's next).

---

## Recommended actions

1. Reject D8. Ship a single unified step shape with no `invoke`/`checkpoint` sugar; rewrite the one example manifest in the same change.
2. Delete the alias tools, the gate-resolve HTTP shim, and dual-write journal events from the plan. One event type, one cutover PR.
3. Write down, as a normative decision, that the `Gate` entity and its `gates` table are deleted; human checkpoints are step contracts with a `presentation.view`, and gate inbox/notifications become a query over step memos.
4. Before scheduling Phase 4, spike the flat-cyclic-graph alternative against `preview-review` end to end; only add true nested steps if the flat model provably fails to give required observability or authoring ergonomics.
5. If nesting proceeds anyway, invert D7 so children auto-open by default (like top-level `next`) and reserve explicit `invoke_step` for genuine multi-way branch ambiguity — don't make "forgot to open the next step" a new failure mode.
6. Re-sequence phases so the single advance function (current Phase 3) ships before token injection and nested sequencing are built on top of the soon-to-be-replaced split advance paths.
7. Add one normative table reconciling `branch`, `route`, and the already-shipped `disposition` before this doc is split into `bridges/step-contract.md` — right now a reader has to reverse-engineer the mapping from three different documents.

— Sonnet reviewer
