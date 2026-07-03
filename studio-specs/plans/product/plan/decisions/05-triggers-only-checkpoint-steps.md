# Decision 05 — Flow triggers only + checkpoint steps + build-before-apply

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-1.md § Assumptions #3](../plan-review-1.md), checkpoint / `start.requires_view` discussion  
**Related:** [Decision 04 — resolve wire](./04-human-checkpoint-resolve-wire.md), [Decision 03 — view context](./03-gate-view-context-shape.md), [Decision 02 — view dev loop](./02-view-dev-loop.md)  
**Supersedes:** Start-checkpoint / `mode: "start"` paths in decisions 03–04 (human UI only via checkpoint steps)  
**Blocks:** Phase 01 (apply lint), 02 (gate dispatch step 0), 03/03b/06 (manifest + shell), 08/10 (tutorials)

---

## Context

The plan used two human UI bind points:

- `start.requires_view` — view **before** run exists → `POST …/run { input }`
- `gate.requires_view` — view **mid-run** → gate resolve

After decisions 03–04, the **author mental model** is one thing: a **checkpoint** (custom view, `disposition` + `output`). Two YAML locations and a separate view `mode: "start"` were legacy split, not a product requirement.

**Product owner (2026-07-03):**

- Prefer **`start:` = triggers only** (or a generic top-level config object) — not human UI.
- Human interaction belongs on **flow steps** (first step can be a checkpoint).
- Agreed: drop `start.requires_view`; unify apply lint on checkpoint view refs; **warn by default / fail under `--strict`** when referenced view has no built `dist/`.

---

## Decision

### 1. Top of manifest = **triggers only** (no human view)

Human UI is **never** declared on the trigger block.

**Normative manifest shape (v2):**

```yaml
apiVersion: murrmure.flow/v1
name: preview-review
description: Localhost preview review until validated

# Triggers — WHEN a run may be created (no views, no steps)
triggers:
  manual: true
  flow_call: false
  events: []
  schedule: null
  idempotency: run_key   # optional

steps:
  - id: intake
    checkpoint:
      view: intake-form
      assignees: []       # optional
      on_resolve:
        when: output.ready
        default: { goto: build }
  - id: build
    invoke: …
  - id: review
    checkpoint:
      view: preview-review
      on_resolve:
        when: output.outcome
        values:
          validated: { goto: done }
          changes_required: { goto: build }
```

#### Field name: `triggers` vs `start`

| Choice | Decision |
|--------|----------|
| **Normative key** | **`triggers:`** — reads as “when this flow runs,” not “human start UI” |
| **Migration** | Compiler accepts legacy **`start:`** as an **alias** of `triggers` during v2; apply emits **warning** `DEPRECATED_START_KEY`. Remove alias after phase 07 cleanup. |
| **Removed** | **`requires_view`** on trigger block — **delete**, not deprecated (no active users) |

Top-level **`description`** (and future metadata) stays alongside `triggers` — the “generic config at top” is: **`name` + `description` + `triggers` + `steps`**, nothing else for human UX.

---

### 2. Human UI = **checkpoint steps only**

**One step kind** for human interaction mid-flow (including **step 0**):

| Manifest | Role |
|----------|------|
| `steps[].checkpoint.view` | View id (`murrmure/views/<id>/`) |
| `steps[].checkpoint.assignees` | Optional gate assignees |
| `steps[].checkpoint.on_resolve` | Branch rules ([decision 04](./04-human-checkpoint-resolve-wire.md)) |
| `steps[].checkpoint.responseSchema` | Optional manifest hint (copied to view context per decision 03) |

**Implementation mapping (phase 02):** checkpoint steps compile to IR kind **`checkpoint`** (alias **`gate`** accepted in compiler during migration). Engine behavior = pause run, create pending gate/checkpoint record, wait for resolve.

**Run flow (manual):**

```text
User clicks Run
  → POST /v1/flows/{id}/run { input: event_payload_or_{} }
  → session + run created
  → engine enters step 0
  → if checkpoint: pause, ViewCanvasHost, view submit
  → resolve { disposition, output } → steps[step_id].output
  → merge rule (§3) → advance per on_resolve
```

No `POST …/run` with human params from view **before** run exists.

---

### 3. First checkpoint → **`exec_context.input`**

When a checkpoint step resolves with `disposition: continue`, the engine:

1. Sets `exec_context.steps[step_id].output` from resolve `output` (+ metadata).
2. If this is the **first resolved checkpoint** in the run **or** manifest flag `checkpoint.merge_input: true` (default **true** for step index 0), **shallow-merge** `output` into `exec_context.input`.

Thus templates keep working:

```yaml
params:
  preview_url: "{{input.preview_url}}"
  reviewer: "{{input.reviewer}}"
```

when `intake` checkpoint output was `{ preview_url, reviewer }`.

Authors may still use `{{steps.intake.output.*}}` explicitly; both resolve after first checkpoint.

---

### 4. View SDK context — drop `mode: "start"`

**`ViewAppContext`** ([decision 03](./03-gate-view-context-shape.md)) updates:

- Remove `mode: "start" | "gate"`.
- All view mounts are **checkpoint** context: `gate` block (nested ids), `steps`, `input`, `session_id`, `run_id`, etc.
- Dev fixtures: only checkpoint-shaped JSON under `dev/fixtures/`.

Shell always: view submit → `{ disposition, output }` → resolve API ([decision 04](./04-human-checkpoint-resolve-wire.md)).

---

### 5. Apply lint — checkpoint views + **`dist/`** (decision 05 / Q5)

Extend phase **01** lint — **one rule** for all checkpoint view refs (from compiled IR / flow index):

| Check | Default | `--strict` |
|-------|---------|------------|
| Checkpoint `view` id not found under `murrmure/views/` | warn | fail |
| View package exists but **`dist/` missing** or manifest `entry` file absent | warn | fail |
| Legacy `start.requires_view` present in manifest | warn (migrate to step 0 checkpoint) | fail |
| Legacy `start:` key without `triggers:` | warn (`DEPRECATED_START_KEY`) | warn (not fail) |

**Not linted at apply:** `dev/fixtures/`, dev server state, whether author ran `npm run build` recently — only **artifact present** at apply time.

Aligns with [decision 02](./02-view-dev-loop.md): ship path is `npm run build` → `mrmr space apply`.

---

### 6. Reference workflow change (preview-review)

Remove start params view (`preview-review-params`). Example:

```yaml
triggers:
  manual: true
steps:
  - id: intake
    checkpoint:
      view: preview-review-intake   # reviewer + preview_url
      on_resolve:
        default: { goto: build }
  - id: build
    invoke:
      params:
        preview_url: "{{input.preview_url}}"
        feedback: "{{steps.review.output.comments}}"
  - id: review
    checkpoint:
      view: preview-review
      on_resolve:
        when: output.outcome
        values:
          validated: { goto: done }
          changes_required: { goto: build }
  - id: done
    invoke: …
```

Tutorial **08-T1** and [10-reference-workflow](../10-reference-workflow-preview-review.md) updated accordingly.

---

## Philosophy alignment

| Principle | Fit |
|-----------|-----|
| Custom views = product | All human UX on checkpoint steps in the graph |
| Protocol vs presentation | Triggers = kernel scheduling; views = step-bound checkpoints |
| One human wire | Single resolve path ([decision 04](./04-human-checkpoint-resolve-wire.md)) |
| Breaking OK | Remove `start.requires_view`; rename `start` → `triggers` |

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [01-apply-validation.md](../01-apply-validation.md) | Checkpoint view + `dist/` lint; deprecate start view refs |
| [02-engine-completion.md](../02-engine-completion.md) | Checkpoint at step 0; input merge; IR kind `checkpoint` |
| [03b-view-sdk.md](../03b-view-sdk.md) | Remove start submit path; single checkpoint context |
| [06-gate-requires-view.md](../06-gate-requires-view.md) | Rename phase scope → checkpoint / ViewCanvasHost (step 0 + mid-run) |
| [10-reference-workflow](../10-reference-workflow-preview-review.md) | Intake checkpoint; no start view |
| [03-space-flow-scaffold.md](../03-space-flow-scaffold.md) | Scaffold `intake` checkpoint step, not `start.requires_view` |
| `packages/contracts/flow/manifest.ts` | `triggers` schema; `FlowCheckpointStepSchema`; remove start.requires_view |
| [04-human-checkpoint-resolve-wire.md](./04-human-checkpoint-resolve-wire.md) | Addendum: superseded start-mode sections — use checkpoint-only |
| [03-gate-view-context-shape.md](./03-gate-view-context-shape.md) | Remove `mode: "start"` |
| Glossary `index.md` | **Checkpoint**, **Triggers**, no “start view” |

---

## Open follow-ups (later queue)

| # | Topic |
|---|--------|
| 6 | `on_resolve` absent → fail run? (still Q6) |
| 7 | Session vs run user-facing nouns |
| 8 | `payload_ref` producer |
| 9 | CLI scaffold taxonomy |

---

*End of decision 05.*
