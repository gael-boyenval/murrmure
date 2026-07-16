# Critical review — Unified step contracts (v2.1)

**Reviewer:** Opus reviewer
**Date:** 2026-07-08
**Spec under review:** [2026-07-07-step-contracts-unified-state-machine.md](./2026-07-07-step-contracts-unified-state-machine.md)
**Grounding read:** `packages/hub-core/src/flow-engine/{advance-runner,checkpoint-runner,advance}.ts`, `gates/service.ts`, `invoke/complete-dispatched.ts`, `projections/step-memo.ts`, `contracts/entities/run-step-memo.ts`, bridges (`action-invoke`, `flow-engine`, `artifacts`), `product/philosophy.md`, `examples/flows/preview-review-v2/`.

---

## 1. Executive verdict

The spec's **core thesis is correct and worth keeping**: a run is one state machine, a step is a contract with branches/schema/routes, and "view vs MCP vs shell" is an *executor detail*, not a protocol noun. That single idea justifies the whole effort, because the codebase today genuinely carries the split the spec complains about — two advance runners (`maybeAdvanceFlow` for invoke completions, `advanceFlowAfterCheckpointResolve` for gates), a full `Gate` entity with its own resolve wire, and a step-memo projection with no monotonic guard. **But the spec then buries that good idea under a second, much larger design (nested steps + qualified IDs + a four-verb nested routing mini-language + three new MCP tools + ~40 injection tokens + composite templates) and an explicitly compatibility-first rollout (aliases, shims, dual-write, YAML-sugar lowering, `apiVersion` retention).** That combination directly violates the product owner's "best foundation, not minimizing rework, no old compatibility code" mandate. My recommendation: **adopt the unified-contract runtime, delete the nested-step machinery from v2.1, and reject the phased-shim framing entirely.** Ship one step kind, one resolve endpoint, one advance function, and a hard cut of the gate/complete_action surface. Everything else is scope the reference workflow does not need.

---

## 2. Critical inconsistencies

### C1 — `branch` and `on_resolve.when/values` are two routing models the spec never reconciles
The "Design thesis" (§Design thesis) and "Resolve request body" (§Unified step API) make **`branch` a first-class, caller-supplied field** ("Submit branch + inline payload"). But the YAML in §Nested steps and the migration table (§Mapping from current v2, row `on_resolve.when`) keep `on_resolve.when: output.outcome / values:` as retained sugar that "lowers to branch routes." So the outcome is expressed **twice**: once by the caller in `branch`, once derived by the engine from `output.outcome`. If a view submits `{ output: { outcome: "validated" } }` but not a `branch`, which wins? If an agent submits `branch: "failed"` but `output.outcome: "validated"`, which routes? The spec is silent. This is the single most important ambiguity because it sits on the hot path of every resolve. Pick one: **caller selects a named branch, full stop**; `when/values` is deleted, not "lowered."

### C2 — Step states `input-required` / `resolved` / `cancelled` do not exist in the memo model
§Resolve rules #1 requires a step be `working` **or `input-required`** to accept resolve; the observability table (§Nested steps → Observability) shows `build.review` in state `input-required`; §Design thesis shows terminal state `resolved`. But `RunStepStatusSchema` (`contracts/entities/run-step-memo.ts`) is exactly `pending | working | completed | failed | skipped`, and `applyStepMemoFromJournal` (`projections/step-memo.ts`) only ever writes `working/completed/failed`. `input-required` is a **run lifecycle** value in the current code (`updateRunLifecycle(runBare, "input-required")` in `gates/service.ts`), not a step status. The spec conflates run lifecycle with step status without saying which layer changes. This must be resolved as a **code change** (introduce a real step-status enum including an "awaiting human" state and derive run lifecycle from steps), and the spec must stop using terms that have no home.

### C3 — Timeout semantics contradict the human-primary north star
§Executors: "`timeout_ms` on action = max **parent step** working time (**includes nested loop**)." The nested loop contains `build.review`, a human checkpoint in ViewCanvasHost that may sit open for hours or days. Binding a shell action timeout to a span that includes open-ended human review means the kernel will `ACTION_TIMED_OUT` a run **while a human is mid-review** — precisely the I2 failure the spec exists to fix, re-introduced structurally. The example's `feature_build.timeout_ms: 3600000` (1h) would kill any review that takes longer than an hour. Human-checkpoint time must be *excluded* from executor timeouts; the two clocks are different animals.

### C4 — First-child auto-activation contradicts "declaration order is not execution order"
§Sequencing invariant / D7: "engine auto-activates **first declared child** when parent enters `working`." §Non-linear child graph: "declaration order is not execution order." These cannot both hold for a non-linear graph — "first declared" is meaningless if declaration order carries no execution semantics. Either children have an explicit entry marker (`entry: true`) or the graph is linear. As written, an author reordering YAML silently changes which child runs first.

### C5 — `continue: parent` is a semantic no-op dressed as vocabulary
§Nested routing vocabulary + line "If `goto` is present, context merge happens on resolve (default); `continue: parent` makes merge explicit for linters/docs." By the spec's own admission the merge already happens by default, so `continue: parent` changes **no runtime behavior** — it exists "for linters/docs." That is a keyword whose only job is to be documentation. Delete it. This leaves the nested router with `complete | goto | fail`, which is still one verb more than the top-level router (`goto | fail`), for no functional gain.

### C6 — `murrmure_invoke_step` is exposed to agents but is ~90% engine-internal
The "One API, all step IDs" table shows `invoke_step` initiated by the **engine** for `write_spec`, `build`, and the first child; the **only** genuine agent-initiated case is opening the human checkpoint `build.review`. Exposing a full MCP tool + HTTP route for parity with an internal function is over-engineering, and it creates a live hazard: the guard that an agent must *never* resolve a human checkpoint (§Sequencing → Human-owned children) is stated as **policy only**, while the capability scope for resolve is `action:invoke` (§Unified step API, marked "TBD: `step:resolve`"). Any agent that can invoke actions can therefore call `resolve_step` on a human checkpoint. Policy prose is not an authorization boundary.

### C7 — The gate entity cannot be "shimmed away" because orchestration gates are not flow checkpoints
The spec proposes `POST /v1/gates/{gate_id}/resolve → lookup bound step_id → unified resolve` (§Resolve request body). But `resolveGateV2` in `gates/service.ts` handles **two unrelated things**: flow-checkpoint gates (`isFlowCheckpointGate`) *and* orchestration-approval gates (`isOrchestrationGate`, from `murrmure_attach_orchestration`), plus notification drafts and the operator inbox. Orchestration gates have no step in any flow IR — they approve an agent-proposed pipeline. The spec's "collapse the gate entity" is silent on orchestration approval, notifications, and the inbox. You cannot delete the gate table without rehoming those. This is a real hole, not a detail.

### C8 — The rollout section contradicts the review mandate and the spec's own "best foundation" language
§Implementation phases, §Mapping, §Resolved decisions D8 all specify: migration **aliases** (`complete_action`, `wait_for_gate`), a **gate.resolve shim**, **dual-write** legacy journal events, retained `apiVersion: murrmure.flow/v1` with `invoke`/`checkpoint` **YAML sugar lowered to IR**, and legacy `decision→disposition` mapping (already present as `mapGateResolveInput`). Every one of these is exactly the "old compatibility code" the product owner asked to be flagged and deleted. D8 ("Unify runtime first; keep `invoke`/`checkpoint` YAML sugar") is the single most debt-generating decision in the document.

---

## 3. Over-engineering / redundant concepts

- **Three MCP tools where one-and-a-half suffice.** `invoke_step` (C6) is mostly internal; `wait_for_step` duplicates `wait_for_gate`, `wait_for_run`, and could be a `get_run?wait=…` long-poll flag. The durable surface is **`resolve_step` + a waiting read**. Two tools, not three-plus-aliases-plus-legacy.
- **`completion.mode` (explicit_resolve vs shell_exit).** Baking exit-code inference into the kernel is a shim. Everything should resolve explicitly; deterministic scripts get a 3-line wrapper that calls the resolve endpoint on the script's behalf. Delete the `shell_exit` adapter as a kernel concept.
- **Nested steps as a third composition primitive.** Murrmure already has `start_flow` (child runs) and `parallel/matrix` (fan-out with join). Nested steps add a *third* mechanism with its own qualified-ID namespace, one-active-child invariant, `STEP_PREREQUISITE_INCOMPLETE` guard, portability rule, nested preview graph, and routing verbs — all to express "loop between a coding step and a review checkpoint." The current engine **already loops top-level** via backward `goto` with a depth guard (`checkpoint-runner.ts` → `CHECKPOINT_BRANCH_MAX_DEPTH`, `stepsFromGoto` resets downstream memos). The reference workflow needs nothing more than `review.on_resolve: changes_required → goto: build`.
- **~40 injection atoms + 3 composite templates.** `{{murrmure.step.build.build-loop.resolve.completed.mcp}}` templates the *exact MCP call string* into prompts — fragile, and it couples prompt text to wire shape. Inject **one structured contract** (`MURRMURE_STEP_CONTRACT` JSON, already in the env table) and let the agent format its own call. Keep ~5 atoms (`run_id`, `step_id`, `workdir`, contract JSON, artifacts JSON).
- **Two directories per step** (`{step}/` stable + `{step}/work/` scratch) keyed by qualified ID. The qualified-ID path dies with nesting; keep one workdir per step and materialize artifacts on resolve.

---

## 4. Simplification proposal — clean-slate architecture

**One primitive: the step contract.** At runtime there is exactly one step kind. Authoring keys `invoke`/`checkpoint`/`gate`/`start_flow` collapse to properties of one shape:

```yaml
- id: review
  view: preview-review            # presence ⇒ human-fulfilled (ViewCanvasHost)
  assignees: ["{{input.reviewer}}"]
  branches:
    validated:        { goto: archive }
    changes_required: { goto: build }
    cancel:           { fail: true }
```

```yaml
- id: build
  executor: feature_build         # presence ⇒ engine dispatches an executor
  params: { spec_filename: "{{input.spec_filename}}" }
  branches:
    completed: { goto: review }
    failed:    { fail: true }
```

Rules:
- **Fulfillment is derived from the contract**, not a kind: has `view` → human/View SDK; has `executor` → engine dispatch; neither → internal (join/timer/child-flow callback).
- **One resolve endpoint** `POST /v1/runs/{run}/steps/{step}/resolve { branch, payload, artifacts_out }`. View submit, agent MCP, and the shell wrapper all hit it. No gate resolve, no complete_action.
- **Caller selects a named branch.** No `when/values` runtime routing (C1). Named branches are the only outcome mechanism.
- **One advance function** consumes `(run, step, branch)`, validates payload+artifacts, merges output/artifacts into `exec_context`, applies the branch route (`goto` / implicit-next / `fail`), and dispatches. It replaces both `maybeAdvanceFlow` and `advanceFlowAfterCheckpointResolve`.
- **Loops are top-level `goto`** (already supported). No nesting, no qualified IDs.
- **Reuse, if ever needed, is `start_flow`** (already supported) — not a new nesting primitive.

### What REMAINS
The unified contract IR; one advance function; one resolve endpoint + one waiting read; top-level `goto` loops with the existing depth guard; `start_flow` for composition; the artifact two-tier model (`artifacts.md`) with a per-step workdir; the monotonic-memo + terminal-run + cancellation safety work (this is genuinely valuable and should be *inside* the new machine, not bolted on).

### What to DELETE (technical debt, no shims)
- `Gate` entity **as the flow-checkpoint carrier**; `POST /v1/gates/:id/resolve`; `resolveGateV2` + `mapGateResolveInput` legacy `decision→disposition` mapping; `murrmure_complete_action`, `murrmure_wait_for_gate`, `murrmure_resolve_gate` and **all migration aliases**.
- `checkpoint-runner.ts` vs `advance-runner.ts` duplication → one runner.
- `completion.mode: shell_exit` as a kernel concept.
- Nested steps, qualified IDs, `murrmure_invoke_step`, `STEP_PREREQUISITE_INCOMPLETE`, one-active-child invariant, nested routing verbs `complete`/`continue`, substep atoms/composites.
- Dual-write journal events → emit only `mrmr.step.resolved`.
- `apiVersion: murrmure.flow/v1` sugar retention → the contract shape is the only authoring shape.

### Where orchestration + notifications go
Keep orchestration approval as its **own explicit thing** (it is not a flow step) or model it as a first-class step with `view` + a dedicated executor — but name it honestly and do not let "collapse the gate entity" quietly drop it. The operator inbox/notifications become a **projection over step memos** where `view` + `assignees` are present, not a separate entity lifecycle.

---

## 5. Recommended spec edits

- **Split the document.** Ship a `step-contract.md` normative bridge with only §Design thesis + §Resolve rules + §Engine invariants. Move nested steps, qualified IDs, and the token catalog to a *deferred* appendix marked "not v2.1."
- **Resolve C1:** delete `on_resolve.when/values`; make `branch` the sole outcome selector; state precedence explicitly (there is none — caller picks).
- **Resolve C2:** define the step-status enum in the spec and note it is a `contracts` change; stop using `input-required`/`resolved`/`cancelled` until the enum lands; derive run lifecycle from step states.
- **Resolve C3:** state that human-checkpoint time is excluded from executor `timeout_ms`; give checkpoints their own (optional) `expires_at`.
- **Resolve C6/authorization:** define a real `step:resolve` scope and a checkpoint-owner guard enforced at the capability layer, not policy prose. Remove `murrmure_invoke_step` from the agent-facing surface.
- **Resolve C7:** add a section on orchestration-approval + notifications after gate-entity removal.
- **Delete the entire "Migration" / phased-shim framing** (D8, aliases, gate shim, dual-write, YAML lowering). Replace with a clean-cut rebuild order (below).
- Remove `continue: parent` (C5) and `completion.mode: shell_exit` (§Over-engineering).
- Reduce injection to one structured contract + ~5 atoms; drop composites and per-branch MCP-string atoms.

---

## 6. Suggested implementation order (rebuild from scratch, no phased shims)

1. **Contract IR.** Replace `invoke`/`gate`/`start_flow`/`checkpoint` runtime kinds with one `step` contract (`executor?`, `view?`, `branches[]`, routes) in `compile.ts`/`parse.ts`. Fail apply on unknown branch/route refs. No dual-kind runtime.
2. **Step-status enum + monotonic projection.** Extend `RunStepStatusSchema` (add an awaiting-human/blocked state + `resolved`); make `applyStepMemoFromJournal` refuse to regress a terminal memo (fixes I2 at the projection); derive `run.lifecycle` from step memos.
3. **Single advance function.** Collapse `maybeAdvanceFlow` + `advanceFlowAfterCheckpointResolve` into one `resolveStep`-driven advancer: validate → merge output/artifacts → select branch → route (`goto`/next/`fail`) → dispatch. Keep the existing backward-`goto` depth guard.
4. **One resolve endpoint + one wait.** `POST /v1/runs/{run}/steps/{step}/resolve`; View SDK `submit` targets it; agents call `resolve_step`; delete `gate.resolve`, `complete_action`, `wait_for_gate`. Add terminal-run rejection + executor cancellation here.
5. **Artifacts.** Per-step workdir under `.mrmr.temp/runs/{run}/steps/{id}/`; `artifacts_out` promotion on resolve; view upload uses the same path. Strict linter for slot coverage.
6. **Structured injection.** Inject one `MURRMURE_STEP_CONTRACT` JSON + ~5 atoms; thin the skills to "follow the injected contract."
7. **Rewrite the reference workflow** (`preview-review-v2`) on the new shape — flat top-level steps, `review.changes_required → goto: build` — and **delete** the old manifest, old actions sugar, and any `complete_action`/`wait_for_gate` usage. Rehome orchestration approval.

Steps 1–4 alone fix every issue Tutorial 1 actually hit (I1, I2, I4) and unify the resolve path. Steps 5–7 are additive. **None of them require an alias, a shim, or a dual-write** — which is the point.

---

*Reviewed adversarially per mandate. The unified-contract kernel is the keeper; nested steps and the compatibility layer are the parts to cut.*

**— Opus reviewer**
