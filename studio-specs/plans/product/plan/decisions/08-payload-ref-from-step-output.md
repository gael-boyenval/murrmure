# Decision 08 — `payload_ref` producer (step output, optional)

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-1.md § Assumptions #8](../plan-review-1.md)  
**Related:** [Decision 03 — gate view context](./03-gate-view-context-shape.md), [Decision 05 — checkpoint steps](./05-triggers-only-checkpoint-steps.md)  
**Blocks:** Phase 02 (step outputs), 06 (context builder), reference workflow 10

---

## Context

Checkpoint view context may include `gate.payload_ref` — an artifact id or URI for **large metadata** (preview bundle, diff summary, attachment) so the view iframe does not receive huge JSON via postMessage.

The plan referenced `payload_ref` in context and gate records but did not specify **who writes it**. Options included hub auto-snapshot on checkpoint open vs explicit producer in the step graph.

### Discussion (2026-07-03)

**Product owner:** Agreed with recommendation **A + C**:

- **`payload_ref` is optional.**
- It **originates from step output** (typically a prior `invoke` step), not hub magic.
- Views may read **`steps.*.output` first**; `payload_ref` is an optional indirection for large blobs.
- **No hub auto-attach snapshot in v2 MVP.**

---

## Decision

### 1. Producer rule (normative)

| Rule | Detail |
|------|--------|
| **Writer** | **Prior step(s)** via `exec_context.steps[step_id].output` — usually the invoke immediately before the checkpoint |
| **Not in v2 MVP** | Hub/engine inferring or generating `payload_ref` at checkpoint pause time |
| **Checkpoint open** | Shell/engine **copies** `payload_ref` from step output into view context **only if present** in a declared source |

**Convention for manifest (optional explicit binding):**

```yaml
  - id: review
    checkpoint:
      view: preview-review
      payload_from: build    # optional; default = prior linear step output
```

If `payload_from` omitted, shell uses **prior step’s `output.payload_ref`** if set; otherwise omits field from context.

### 2. Invoke / action contract

Actions (agents, scripts) may return:

```json
{
  "preview_url": "http://localhost:3000",
  "payload_ref": "art_preview_bundle_abc"
}
```

Engine stores full object on `steps.build.output` ([phase 02](../02-engine-completion.md)). Shell sets:

```typescript
gate: {
  …,
  payload_ref: steps.build.output.payload_ref  // optional
}
```

Views **should** prefer:

1. `steps.build.output.preview_url` (or templated fields) for common cases  
2. `gate.payload_ref` + `useViewHubClient()` artifact read when payload is large

### 3. View context (decision 03 alignment)

`gate.payload_ref` in `ViewAppContext` is **read-only**, **optional**, populated only from step output chain — never author-written at apply time.

Dev fixtures ([decision 02](./02-view-dev-loop.md)) may include `"payload_ref": "art_dev_fixture"` for testing artifact fetch paths.

### 4. Deferred (not v2)

- Hub auto-snapshot of pending artifacts into `payload_ref` on checkpoint open (**option B** — future if needed).
- Manifest-required `payload_from` validation beyond optional lint warn.

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [02-engine-completion.md](../02-engine-completion.md) | Document action may emit `payload_ref` in step output |
| [06-gate-requires-view.md](../06-gate-requires-view.md) | Context builder copies from prior step output |
| [10-reference-workflow](../10-reference-workflow-preview-review.md) | `build` output may include optional `payload_ref`; view reads `preview_url` first |
| [03-gate-view-context-shape.md](./03-gate-view-context-shape.md) | Note optional + producer |
| Skill `reference/views.md` | When to use payload_ref vs steps output |

---

*End of decision 08.*
