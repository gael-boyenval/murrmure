# Plan — Simplify flow branch API (research)

**Date:** 2026-07-10  
**Status:** Planned — **Phase 0 (research) not started**  
**Goal:** Reduce authoring friction in `flow.manifest.yaml` step **branches**. Today authors must learn two routing vocabularies (`next` / `fail_run` vs `goto` / `complete` / `continue` / `fail`) and nullable `next: null` terminal semantics. Tutorial 1 v3 feedback: too abstract, too many keys, unclear what is required.

**Principle:** The manifest is a **description** of a process — branch outcomes should read like plain outcomes (“go to X”, “done”, “failed”), not parent/child-specific mini-languages.

**Tutorial driver:** [Tutorial 1 v3 Part 2](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/02-build-minimal-flow.md) documents required branch fields as a stopgap until this plan lands. **Concrete slice:** [2026-07-10-step-default-branches.md](./2026-07-10-step-default-branches.md) (`completed` / `failed` from step order).

**Related:** [2026-07-10-branch-schema-artifact-validation.md](./2026-07-10-branch-schema-artifact-validation.md) — `schema.required` artifact slots (orthogonal).

---

## Problem statement

### Current branch shape (v2.2)

```yaml
branches:
  continue:
    schema: { type: object, required: [spec_filename] }
    artifact_slots: { spec: { max_bytes: 1048576 } }
    next: null          # top-level terminal — feels redundant
  cancel:
    schema: { type: object }
    fail_run: true
```

Nested build/review loop adds a **second** routing set:

```yaml
# nested child — different keys for the same conceptual “what happens next”
branches:
  validated:
    schema: { type: object }
    complete: parent
  changes_required:
    schema: { type: object }
    continue: parent
    goto: build-loop
  cancel:
    schema: { type: object }
    fail: true
```

### Pain points (author + reader)

| ID | Symptom | Example |
|----|---------|---------|
| **B-1** | **`next` required for top-level** even when meaning is “run ends” | `next: null` on every terminal branch |
| **B-2** | **Dual routing vocabularies** — top-level vs nested keys for the same ideas | `next` vs `goto`; `fail_run` vs `fail` |
| **B-3** | **Resolver modality leaked into flows** | `role` and `presentation.view` make a portable contract choose whether a human, agent, script, or View resolves it |
| **B-4** | **Branch = schema + routing + artifacts** in one flat object — hard to scan | No separation of “payload contract” vs “graph effect” |
| **B-5** | **Author must know nesting rules** before writing loops | `NESTED_TOP_LEVEL_ROUTE` lint errors |
| **B-6** | **MCP resolve uses branch id strings** tied to manifest keys | Renaming branches breaks clients — acceptable but docs must be stable |

### Shipped implementation anchors

| Layer | Path |
|-------|------|
| Authoring schema | `packages/contracts/src/entities/step-contract.ts` — `StepBranchDefinitionSchema` |
| Compile / lint | `packages/hub-core/src/flow-engine/step-contract-compile.ts` — `compileBranchRoutes`, `lintBranchRoutes` |
| Runtime resolve | `packages/hub-core/src/flow-engine/step-resolve.ts` |
| Normative bridge | `studio-specs/current/bridges/step-contract.md` |
| Reviews | `studio-specs/archives/plans/shipped-2026-07/step-contracts-v21review-opus.md` (nested routing complexity) |

---

## Phase 0 — Research & definition (blocking)

**No schema or compiler changes until Phase 0 deliverables are reviewed.**

### 0.1 — Inventory current branch keys

Map every authoring key → compiled `StepCatalogRoute` → runtime effect.

| Authoring key | Top-level | Nested | Compiled `engine` |
|---------------|-----------|--------|-------------------|
| `next: <id>` | ✓ | ✗ (lint) | `open` |
| `next: null` | ✓ | ✗ | `advance` (terminal success) |
| `fail_run: true` | ✓ | ✗ | `fail_run` |
| `goto: <child>` | ✗ | ✓ | `goto` |
| `complete: parent` | ✗ | ✓ | `complete_parent` |
| `continue: parent` | ✗ | ✓ | `continue_parent` |
| `fail: true` | ✗ | ✓ | `fail_run` |

**Deliverable:** one table + count of manifest occurrences in `test-utils/`, `examples` archives, tutorials.

### 0.2 — Research questions

**Routing unification**

1. **Decided:** `next` is omitted for terminal success. The compiler materializes canonical `advance` routing; authored and compiled contracts never contain `next: null`.
2. Use `route: { step: <id> }` to open/transfer to another step and `route: { run: failed }` for immediate run failure.
3. Use `resume: <ancestor-step>` only to return control to an already-open ancestor. Resume never opens or resolves its target.
4. Remove `complete_parent`, `continue_parent`, and `goto`; nested control is child activation followed by protocol-level resume.

**Resolver modality — decided 2026-07-14**

5. Remove `role` and `presentation` from authored and compiled steps.
6. A step is only a contract plus open/resolve events, branches, and routes.
7. Spaces choose resolvers through handlers, including `type: view_resolver`; no resolver modality is inferred by the compiler.
8. Generic lifecycle is `open` → `resolved` with plural `open_steps[]`; remove `awaiting_human`, `active_human_step`, role-based handler lint/dispatch, and built-in resolver forms.

**Branch structure**

9. **Decided:** keep `schema`, `artifact_slots`, and optional `route` / `resume` as sibling fields on a flat branch. Do not add `payload` or `outcome` wrappers.
10. **Decided:** omitted `branches` injects fixed `completed` and `failed`. An explicit branch map is exact. At top level only `completed` and `failed` receive control defaults; custom names require an explicit `route`. Nested no-control branches resume their immediate parent.
11. **Decided:** a nested branch with neither `route` nor `resume` resumes its immediate parent, including `failed`. Immediate run failure is always explicit.
12. A parent remains open while one declared child is active. Its resolver uses `murrmure_open_child_step({ run_id, parent_step_id, child_step_id, idempotency_key })`, then receives a normal resume invocation when that child resolves. The operation accepts no arbitrary input.
13. Successful child open yields the current parent assignment and revokes its mutation credential. Child return creates one fresh resumed assignment; View resolvers refresh in place.

**Clean-slate cutover**

14. Remove superseded branch keys and schema shapes in the same slice; no dual-read, aliases, migration, or deprecation path.
15. Keep `murrmure_resolve_step({ branch })` aligned only with the chosen target branch ids.
16. Remove explicit and inferred `wait` step kinds. Waiting is the normal open state of a generic step; time- or event-driven space handlers resolve it.
17. Keep `apiVersion: murrmure.flow/v1` as the sole clean target; delete superseded v1 shapes and do not introduce a v2 or dual-version parser.

### 0.3 — Target control shape

```yaml
branches:
  continue:
    schema: { type: object, required: [spec] }
    artifact_slots:
      spec: { max_bytes: 1048576 }
    route: { step: write_spec }
  cancel:
    schema: { type: object }
    route: { run: failed }

# Nested child: explicit ancestor or omitted immediate-parent default
branches:
  validated:
    schema: { type: object }
    resume: build
  failed:
    schema: { type: object }
    # no route/resume: resumes immediate parent
```

`resume` produces a canonical resume event and resolver invocation; it is not transparent OS-process suspension. Agent adapters may reuse an existing agent session, but protocol correctness never depends on process/session continuation. The resumed parent validates only its own contract when it later resolves itself.

`route.run` accepts `completed` or `failed`. Custom top-level terminal branches must use one explicitly. Omitting `branches` injects both standard branches; supplying a map declares the complete branch set.

**Locked invariant — modality-agnostic steps**

```yaml
steps:
  - id: intake
    branches: …
  - id: write_spec
    branches: …
```

The space independently binds `intake` to a `view_resolver` and `write_spec` to a shell/agent handler.

For each option: express **preview-review nested loop** and **Tutorial 1 one-step intake**; count YAML lines vs v2.2.

### 0.4 — Stakeholder constraints

| Constraint | Source |
|------------|--------|
| Flow manifest stays **protocol-only** | Product north star |
| Portability across spaces | No execution in manifest |
| `murrmure_resolve_step(branch, payload)` wire stable | MCP + views |
| Strict apply lints remain meaningful | `DEAD_STEP`, orphan/duplicate resolver bindings, invalid routes; unbound steps are valid |
| Tutorial teaches **description not execution** | Tutorial 1 v3 |

### 0.5 — Phase 0 exit criteria

- [x] Chosen control shape: strict `route` object for step/run transitions plus `resume` for open ancestors
- [x] Remove **`role`** and `presentation`; resolver modality is entirely space-owned
- [x] Remove **`next: null`** — omitted routing on terminal `completed` compiles to canonical terminal-success `advance`
- [x] Unified control story: routes open/fail; nested return resumes an open ancestor without reopening or resolving it
- [x] Clean cutover: no dual-read, migration code, or legacy-specific diagnostics; removed shapes fail normal strict-schema validation
- [ ] Doc impact list (`step-contract.md`, Tutorial 1 v3, skill-developer, `docs-proof`)

---

## Phase 1 — Spec & ADR (after Phase 0)

- ADR in `studio-specs/ADR/` for the clean target branch API
- Update `studio-specs/current/bridges/step-contract.md`
- Zod schema changes in `@murrmure/contracts`

---

## Phase 2 — Compiler & runtime (after Phase 0)

- `step-contract-compile.ts` — lower new shape → existing `StepCatalogRoute` (prefer thin runtime change)
- Add canonical resume event, one-active-child state, and idempotent `murrmure_open_child_step` for a caller-owned open parent and its declared child.
- Delete `complete_parent`, `continue_parent`, `goto`, and automatic parent completion.
- Lint messages in author-friendly vocabulary
- Tests: `step-contract-compile.test.ts`, `advance-runner.test.ts`, preview-review fixtures

---

## Phase 3 — Docs & tutorial (after Phase 2)

- Rewrite Tutorial 1 v3 Part 2 branch section to match chosen API
- Remove “required fields” stopgap tables that exist only because of v2.2 complexity
- `skill-developer/reference/flow-authoring.md`

---

## Non-goals (unless Phase 0 expands scope)

- Removing **nested steps** entirely (separate debate — see opus review)
- Changing the existing **MCP resolve** wire format; the new parent-scoped child-activation operation and resume dispatch integrate with the handler and prompt-protocol plans
- Graphical flow editor

---

## Acceptance criteria (final)

| ID | Criterion |
|----|-----------|
| **BA-1** | Tutorial 1 one-step `intake` manifest ≤ N lines with no `next: null` (target TBD in Phase 0) |
| **BA-2** | Same routing field names at top-level and nested for equivalent outcomes |
| **BA-3** | Author docs fit on one screen — branch outcomes explained without parent/child key matrix |
| **BA-4** | Flow schema/catalog contain no `role` or `presentation`; resolver modality exists only in space handlers |
| **BA-5** | Superseded branch shapes have no parser/compiler/runtime path |
| **BA-6** | Nested no-route defaults resume the immediate parent; explicit resume targets an open ancestor and never emits a second parent `step.opened` or resolves the parent |
| **BA-7** | Parent resolver can idempotently call `murrmure_open_child_step` for one declared child; arbitrary input and a second concurrent child are rejected |
| **BA-8** | Opening a child atomically yields and revokes the current parent assignment; child return creates exactly one fresh resumed assignment while the parent step remains open |
| **BA-9** | Explicit branch maps receive no missing-branch injection; custom top-level branches without `route` fail apply, while nested no-control branches resume their immediate parent |

---

## Open questions log

| Date | Question | Decision |
|------|----------|----------|
| 2026-07-14 | Keep `role` or View identity in flow YAML? | **No.** Steps are resolver-agnostic; spaces bind resolvers through handlers. |
| 2026-07-14 | Compatibility path? | **None.** Clean-slate removal only. |
| 2026-07-14 | Generic step lifecycle/API? | **`open` → `resolved`; `open_steps[]`.** |
| 2026-07-14 | Keep a `wait` step kind? | **No.** Generic steps remain open; space handlers resolve them on time or external events. |
| 2026-07-14 | How is terminal success represented? | **Omit authored routing; compile to canonical `advance`. Never serialize `next: null`.** |
| 2026-07-14 | How do nested children return control? | **Resume.** Omitted control resumes the immediate parent; explicit `resume` targets an open ancestor. The parent remains open and owns its own resolution. |
| 2026-07-14 | Is resume process continuation? | **No.** It is a protocol event and normal resolver invocation; adapters may optionally reuse an agent session. |
| 2026-07-14 | How does a parent open a child? | **`murrmure_open_child_step({ run_id, parent_step_id, child_step_id, idempotency_key })`.** No arbitrary input; one declared active child; parent remains open. |
| 2026-07-14 | What happens to the parent invocation? | Successful child open **yields** it and revokes mutation rights; child return creates a fresh resumed invocation. Views refresh in place. |
| 2026-07-14 | Should branch contracts gain wrapper objects? | **No.** Keep `schema`, `artifact_slots`, and `route`/`resume` flat. |
| 2026-07-14 | Are default branch names configurable or partially merged? | **No.** Omission injects fixed `completed`/`failed`; an explicit map is exact. Custom top-level branches route explicitly. |
| 2026-07-14 | Bump the flow `apiVersion`? | **No.** Replace pre-release v1 cleanly; do not preserve old v1 or add v2 compatibility. |

---

## Related

- [step-contract.md](../current/bridges/step-contract.md) — normative v2.2
- [Tutorial 1 v3 Part 2](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/02-build-minimal-flow.md)
- [step-contracts-v21review-opus.md](../archives/plans/shipped-2026-07/step-contracts-v21review-opus.md)
- [2026-07-10-agent-grant-onboarding.md](./2026-07-10-agent-grant-onboarding.md) — parallel UX simplification
