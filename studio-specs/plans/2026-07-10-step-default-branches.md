# Plan — Default step branches (`completed` / `failed`)

**Date:** 2026-07-10  
**Status:** Planned — **not started**  
**Goal:** Linear flow steps need only **`id`** and **`description`** in `flow.manifest.yaml`. The compiler injects default **`completed`** and **`failed`** branches; `completed` routes to the **next step in manifest order**; `failed` ends the run.

**Tutorial driver:** [Tutorial 1 v3](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/) — Part 5 adds `write_spec`, `build`; Part 6 adds `cleanup`.

**Related:** [2026-07-10-flow-branch-api-simplify.md](./2026-07-10-flow-branch-api-simplify.md) (broader routing research — this plan is a **concrete slice** that can land first).

---

## Problem

Authors repeat the same branch boilerplate on every linear step:

```yaml
branches:
  completed:
    schema: { type: object }
    route: { step: build }
  failed:
    schema: { type: object }
    route: { run: failed }
```

Tutorial feedback: too many keys for a simple pipeline. The manifest should read as a **step list**, not a routing matrix.

---

## Target behavior

### When `branches` is omitted

For each **top-level** step in `manifest.steps` (array order):

| Injected branch | Schema | Routing |
|-----------------|--------|---------|
| **`completed`** | `{ type: object }` | `route.step` = **id of the next step** in the same `steps` array; the last step compiles to canonical terminal-success `advance` routing |
| **`failed`** | `{ type: object }` | Canonical `route: { run: failed }` |

**Authoring minimum:**

```yaml
steps:
  - id: write_spec
    description: Copy intake spec into the repo (shell command).
  - id: build
    description: Agent implements the spec and proposes commit subject + description.
    branches:
      completed:
        schema:
          type: object
          required: [commit_message, description]
          properties:
            commit_message: { type: string }
            description: { type: string }
  - id: cleanup
    description: Archive spec and git commit using build output.
```

Compiled catalog for `write_spec` must expose `completed` → opens `build`, `failed` → canonical run failure.

### When `branches` is present

Author defines the complete branch set when names, schemas, or routing differ from defaults. The compiler does not inject a missing `completed` or `failed` branch into an explicit map. `route` remains optional only for the standard names:

| Branch | When `route` omitted |
|--------|----------------------|
| **`completed`** | `route.step` = **id of the next step** in manifest order; the last step compiles to terminal-success `advance` routing |
| **`failed`** | Canonical run-failure routing |

You only write `route` when routing is non-linear (skip, loop, or terminal before a later step is added).

Custom top-level branch names require an explicit target in the clean routing API: `route: { step: <id> }`, `route: { run: completed }`, or `route: { run: failed }`. Nested no-control branches instead resume their immediate parent.

**Example — custom `completed` schema, default routing:**

```yaml
  - id: build
    description: Agent implements the spec and proposes commit subject + description.
    branches:
      completed:
        schema:
          type: object
          required: [commit_message, description]
          properties:
            commit_message: { type: string }
            description: { type: string }
      failed:
        schema: { type: object }
```

With **`cleanup`** listed next in `steps`, compiled `build.completed` routes to **`cleanup`** without an authored route. With no following step, `completed` terminates the run without nullable routing.

Use explicit `route` only when:

- Branch names differ (`continue` / `cancel` on intake)
- Branch carries **artifact_slots** or custom **schema**
- Routing is non-linear — explicit `route` skips a step, loops, or targets a non-adjacent step

### Human intake (Tutorial 1)

`intake` keeps explicit branches — not `completed`/`failed`:

```yaml
- id: intake
  description: Human attaches one spec markdown file.
  branches:
    continue:
      schema: { type: object, required: [spec] }
      artifact_slots: { spec: { max_bytes: 1048576 } }
    route: { step: write_spec }
    cancel:
      schema: { type: object }
    route: { run: failed }
```

Steps are resolver-agnostic: no `role` or View identity appears in the flow. The space binds `intake` to a `view_resolver` in `handlers.yaml`.

---

## Normative rules (proposed)

1. **`branches` optional** on `StepContractManifestStep` when defaults apply.
2. **Default injection** runs at **compile** time (`compileStepContractCatalog`) before route lowering — injected branches are indistinguishable from authored ones in the catalog.
3. **Last step** in array: omitted `completed.route` → canonical terminal success (`advance`), with no nullable route in authored or compiled contracts.
4. **`failed`**: omitted `route` → canonical run failure.
5. **Partial branches:** author may set schema/artifact_slots on a standard branch and omit `route` — compiler fills control from step order/name.
   The explicit branch map is otherwise exact; no missing standard branch is injected.
6. **Resolver modality:** remove `role` and `presentation` from authored/compiled steps; dispatch and completion come from space handlers. Removed fields receive only normal strict-schema errors, with no legacy-specific diagnostics.
7. **Nested steps** (`steps:` children): this slice implements top-level defaults only. The target nested rule is locked for the follow-up branch-API slice: any nested branch with neither `route` nor `resume` resumes its immediate parent, including `failed`. Explicit `resume: <ancestor-step>` returns control without reopening or resolving the ancestor; immediate run failure requires explicit `route: { run: failed }`.
8. **Lint:** explicit empty `branches: {}` is an error.

---

## Code changes

| File | Change |
|------|--------|
| `packages/contracts/src/entities/step-contract.ts` | `branches` optional on `StepContractManifestStepSchema` |
| `packages/hub-core/src/flow-engine/step-contract-compile.ts` | `applyDefaultBranches(flatSteps)` before `compileCatalogEntries`; compute next-step id from array index |
| `packages/hub-core/src/flow-engine/step-contract-compile.ts` | On authored standard branches: default omitted `route` from step order/name |
| Step contract schema/compiler/runtime | Delete `role`, `presentation`, `deriveRole`, `awaiting_human`, and role-based dispatch; expose `open` → `resolved` with `open_steps[]` |
| `packages/hub-core/test/unit/flow-engine/step-contract-compile.test.ts` | Minimal three-step manifest; assert routes |
| `apps/docs/guide/tutorials/01-local-preview-review-v3/` | Part 2 callout + Part 5 minimal steps |
| `studio-specs/current/bridges/step-contract.md` | Document defaults when shipped |

---

## Acceptance criteria

| ID | Criterion |
|----|-----------|
| **DB-1** | Step with only `id` + `description` compiles with `completed` and `failed` branches |
| **DB-2** | `completed` targets the next sibling step id; last step gets canonical `advance` terminal routing with no nullable route |
| **DB-3** | `failed` resolves with run-failure routing without authoring it |
| **DB-4** | Explicit standard branches with omitted `route` still receive name/order-based control |
| **DB-5** | Tutorial 1 v3 Parts 5–6 never author linear-step routes |
| **DB-6** | Authored and compiled contracts contain no `next`, `fail_run`, or nullable routing; superseded fields are rejected by the clean target schema |
| **DB-7** | Omitted branch map injects both fixed defaults; an explicit map receives no missing-branch injection, and custom top-level branches require an explicit route |

---

## Doc sync (same PR as code)

- [Tutorial 1 v3 Part 2](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/02-build-minimal-flow.md) — “Default branches” section
- [Tutorial 1 v3 Part 5](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/05-extend-flow-and-handlers.md) — minimal steps
- `skill-developer/reference/flow-authoring.md` — default branch convention
- `studio-specs/current/bridges/step-contract.md`

---

## Non-goals (this slice)

- Renaming `continue`/`cancel` to `completed`/`failed` on intake steps
- Adding resolver or View identity to flow steps
- Default branches inside **nested** `steps:` subgraphs

---

## Open questions

| # | Question | Proposed default |
|---|----------|------------------|
| 1 | Partial standard branch control (author schema only, inject route)? | **Yes** — omit `route` on `completed` / `failed`; compiler fills from name/order |
| 2 | Default branch names configurable? | **No** — omission injects fixed `completed` / `failed`; explicit maps are exact |
| 3 | `apiVersion` bump? | **No** — `murrmure.flow/v1` becomes the sole clean target; no legacy-v1 or v2 parser remains |
