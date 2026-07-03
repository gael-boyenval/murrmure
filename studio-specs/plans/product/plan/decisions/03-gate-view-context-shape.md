# Decision 03 — Gate view context shape (nested + `responseSchema`)

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-1.md § Assumptions #6](../plan-review-1.md), boundary analysis  
**Related:** [Decision 02 — view dev fixtures](./02-view-dev-loop.md)  
**Blocks:** Phase 03b (`ViewAppContext`), phase 06 (shell context builder), view-sdk types

---

## Context

The shell sends **`murrmure.view.context`** to view apps via postMessage. Authors read it through `useViewContext()` (`ViewAppContext`).

Two phase docs defined **different shapes**:

| Source | Shape |
|--------|--------|
| [03b-view-sdk.md](../03b-view-sdk.md) | **Nested** — gate fields under `gate: { gate_id, step_id, payload_ref, form_schema }` |
| [06-gate-requires-view.md](../06-gate-requires-view.md) | **Flat** — `gate_id`, `step_id`, `payload_ref` at top level alongside `mode`, `steps`, `input` |

The shipped [view-sdk `ViewHostContext`](../../../../packages/view-sdk/src/types.ts) today has only routing ids (`flow_id`, `space_id`, `token`, …) — no `mode`, `steps`, or gate block yet.

Authors and agents need **one normative type** owned by `@murrmure/view-sdk`, referenced by 03b, 06, dev fixtures, and the reference workflow — not redeclared per phase.

### Naming discussion

03b used `form_schema?: GateFormSchema` on the gate block. That name implies a **built-in form UI**, but custom views are free to render anything (preview iframe, comment thread, buttons only). The schema is really a **hint about the expected human response / submit shape**, not a mandate to render form fields.

**Product owner (2026-07-03):**

- **Nested gate block** (03b wins over 06 flat fields).
- Rename view-context field to **`responseSchema`** — not `form_schema`.

---

## Decision

### Single type: `ViewAppContext`

Defined once in `@murrmure/view-sdk` (app export). Phase 06 **must not** redeclare a conflicting flat shape.

```typescript
/** Base host routing — always present */
interface ViewHostContext {
  flow_id: string;
  space_id: string;
  hub_base_url: string;
  token: string;
  session_id?: string;
  run_id?: string;
}

/** Full context — shell → view postMessage payload */
interface ViewAppContext extends ViewHostContext {
  /** Which checkpoint opened this view */
  mode: "start" | "gate";

  /** Present when mode === "gate" */
  gate?: ViewGateContext;

  /** Snapshot of exec_context.steps (prior step outputs) */
  steps?: Record<string, { output?: Record<string, unknown>; status?: string }>;

  /** Run input bag (exec_context.input) */
  input?: Record<string, unknown>;
}

interface ViewGateContext {
  gate_id: string;
  step_id: string;
  payload_ref?: string;
  /**
   * Optional schema describing the expected human response / submit shape.
   * Custom views may ignore it or use it for validation/UI hints.
   * NOT a requirement to render a form.
   */
  responseSchema?: ResponseSchema;
}
```

`ViewAppContext` is the **only** author-facing context type. Drop a separate conflicting name unless `ViewAppContext` is explicitly documented as an alias (not needed).

### `responseSchema` (not `form_schema`)

| Layer | Name | Role |
|-------|------|------|
| **View context** (`gate.responseSchema`) | `responseSchema` | Optional hint for custom views — expected submit/response structure |
| **Protocol / manifest** (`gate.form`) | `GateFormSchema` | Shell **fallback only** — built-in `GateResolvePanel` when no view bundle |
| **View context** | ~~`form_schema`~~ | **Do not use** — removed |

**Type:** `ResponseSchema` — v1 may reuse the structural shape of `GateFormSchema` when the manifest declares `gate.form` (shell copies manifest form into `gate.responseSchema` for views that want field metadata). Long-term may widen to JSON Schema; v1 documents the copy rule, not a second protocol type.

**Rationale:** Custom views own presentation. `responseSchema` describes *what* the human might submit, not *how* to render it. `GateFormSchema` stays the name for shell embedded forms only.

### Nested vs flat — rules

| Field | Location | When present |
|-------|----------|--------------|
| `mode` | top-level | always |
| `input`, `steps` | top-level | when populated from run |
| `gate_id`, `step_id`, `payload_ref`, `responseSchema` | **`gate` object only** | when `mode === "gate"` |
| ~~top-level `gate_id`~~ | forbidden in view context | use `gate.gate_id` |

**Start mode (`mode: "start"`):** no `gate` block. Params schema for start lives in `view.manifest.yaml` `params_schema` (unchanged).

---

### Dev fixtures (align with decision 02)

`dev/fixtures/*.json` use the same nested shape:

```json
{
  "flow_id": "preview-review",
  "space_id": "spc_local",
  "hub_base_url": "http://127.0.0.1:8787",
  "token": "dev-readonly",
  "session_id": "ses_dev",
  "run_id": "run_dev",
  "mode": "gate",
  "gate": {
    "gate_id": "gte_dev",
    "step_id": "review",
    "payload_ref": "art_preview_meta",
    "responseSchema": {
      "id": "review-response",
      "fields": [
        { "name": "notes", "type": "string", "title": "Notes", "required": false }
      ]
    }
  },
  "input": { "reviewer": "you@local", "preview_url": "http://localhost:3000" },
  "steps": {
    "build": {
      "status": "completed",
      "output": { "preview_url": "http://localhost:3000" }
    }
  }
}
```

---

### Shell context builder (phase 06)

When mounting ViewCanvasHost for a pending gate:

1. Set `mode: "gate"`.
2. Populate `gate: { gate_id, step_id, payload_ref }` from pending gate record.
3. If manifest step has `gate.form`, copy into `gate.responseSchema` (same structure; different field name in view context).
4. Populate `steps` and `input` from run `exec_context`.

When mounting for `start.requires_view`:

1. Set `mode: "start"`.
2. Omit `gate`.
3. Populate `input` if pre-filled; `steps` typically empty.

---

## Philosophy alignment

- **Views own presentation** — `responseSchema` is a contract hint, not a form renderer directive.
- **Protocol vs view boundary** — manifest `gate.form` serves shell fallback; view context uses `responseSchema` for custom UI.
- **One public API** — nested `gate` keeps start vs gate checkpoints structurally obvious in `useViewContext()`.

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [03b-view-sdk.md](../03b-view-sdk.md) | `form_schema` → `responseSchema`; nested `gate` only |
| [06-gate-requires-view.md](../06-gate-requires-view.md) | **Delete flat redefinition**; reference view-sdk type; document copy rule manifest `form` → `gate.responseSchema` |
| [02-view-dev-loop.md](./02-view-dev-loop.md) | Fixture example updated to nested `gate` |
| [10-reference-workflow-preview-review.md](../10-reference-workflow-preview-review.md) | Context examples use nested `gate` if added |
| `packages/view-sdk/src/types.ts` | Add `ViewAppContext`, `ViewGateContext`, `ResponseSchema` |
| Glossary in `index.md` (future) | `responseSchema` vs manifest `gate.form` |

**No rename of `GateFormSchema` in contracts** — that type remains for protocol entities and shell fallback forms. Only the **view-context field name** changes.

---

*End of decision 03.*
