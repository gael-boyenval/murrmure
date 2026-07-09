# Decision 06 — Checkpoint `on_resolve` must be explicit

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-1.md § Assumptions #4](../plan-review-1.md), phase 02 default behavior  
**Related:** [Decision 04 — resolve wire](./04-human-checkpoint-resolve-wire.md), [Decision 05 — checkpoint steps](./05-triggers-only-checkpoint-steps.md)  
**Blocks:** Phase 01 (apply lint), 02 (branch planner)

---

## Context

When a human resolves a checkpoint, the engine must know **where the run goes next**. Phase 02 draft prose implied silent defaults:

- `approved` / continue with no rule → advance to next linear step
- `rejected` / cancel with no rule → **fail run**

That hides product behavior in engine magic and breaks review loops if authors forget loop-back rules. After decisions 04–05, branching is **output-driven** (`on_resolve.when: output.outcome`) and checkpoints are the only human steps — authors must declare routing explicitly.

### Options considered

| Option | Summary | Rejected because |
|--------|---------|------------------|
| A. Fail run on any unmatched outcome | Simple | Too harsh for benign checkpoints; no explicit manifest |
| B. Hold run (stay paused) | Recoverable | Stuck-run UX; engine complexity |
| **C. Explicit sentinel required** | Manifest declares defaults; lint + strict | **Chosen** |
| D. Continue linearly on unmatched | Permissive | Dangerous for review loops |

**Product owner (2026-07-03):** **C**

---

## Decision

### 1. No silent engine defaults for checkpoint routing

The engine **must not** infer goto targets when `on_resolve` does not cover the resolved outcome. Every checkpoint step **must** declare enough routing for apply to validate.

**Required manifest shape (normative):**

```yaml
steps:
  - id: review
    checkpoint:
      view: preview-review
      on_resolve:
        when: output.outcome          # branch key (decision 04)
        values:
          validated: { goto: done }
          changes_required: { goto: build }
        default: { goto: done }       # REQUIRED — explicit fallback
        cancel: { fail: true }        # REQUIRED — explicit cancel/disposition:cancel handling
```

| Field | Required | Role |
|-------|----------|------|
| `on_resolve.when` | When step uses value branching | Field path on resolve `output` (e.g. `output.outcome`) |
| `on_resolve.values` | When `when` present | Map value → `{ goto }` or `{ fail: true }` |
| **`on_resolve.default`** | **Yes (always)** | Route when `when` key missing or no `values` match |
| **`on_resolve.cancel`** | **Yes (always)** | Route when human resolves with `disposition: cancel` |

**Minimal checkpoint (no value branching):**

```yaml
  - id: intake
    checkpoint:
      view: intake-form
      on_resolve:
        default: { goto: build }
        cancel: { fail: true }
```

### 2. Engine behavior (normative)

On checkpoint resolve:

1. Persist `steps[step_id].output` ([decision 04](./04-human-checkpoint-resolve-wire.md)).
2. If `disposition: cancel` → apply **`on_resolve.cancel`** only (no silent fail).
3. If `disposition: continue` → evaluate `when` / `values`; if no match → apply **`on_resolve.default`**.
4. Target actions:
   - `{ goto: "<step_id>" }` — jump; cycle detection max depth 32 (phase 02).
   - `{ fail: true }` — terminal run failure with reason `checkpoint_cancelled` or `checkpoint_failed`.
5. If **`default` or `cancel` absent at runtime** (should not happen post-strict apply) → fail run with `checkpoint_routing_missing` (engine safety net, not author-facing default).

**Removed:** prose defaults “approved absent → next step”, “rejected absent → fail run” without manifest entries.

### 3. Apply lint (phase 01 + 02)

| Check | Default | `--strict` |
|-------|---------|------------|
| Checkpoint step missing `on_resolve.default` | warn | **fail** |
| Checkpoint step missing `on_resolve.cancel` | warn | **fail** |
| Checkpoint after `invoke` step, no `values.*` loop-back to earlier invoke | warn (likely review loop) | warn |
| `on_resolve.when` set but `values` empty | warn | fail |
| `goto` target step id not in manifest | warn | fail |

Lint code examples: `CHECKPOINT_ON_RESOLVE_DEFAULT_MISSING`, `CHECKPOINT_ON_RESOLVE_CANCEL_MISSING`, `CHECKPOINT_LOOPBACK_HINT`.

### 4. Interaction with disposition (decision 04)

| Resolve | Routing rule used |
|---------|-------------------|
| `disposition: continue`, output matches `values` | Matching `{ goto }` |
| `disposition: continue`, no match | **`on_resolve.default`** |
| `disposition: cancel` | **`on_resolve.cancel`** (typically `{ fail: true }`; may `{ goto: intake }` if product allows “back”) |

Review loop “Request changes” uses **`disposition: continue`** + `output.outcome: changes_required` → `values.changes_required.goto: build` — not cancel.

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [02-engine-completion.md](../02-engine-completion.md) | Remove silent defaults; require default/cancel; branch planner |
| [01-apply-validation.md](../01-apply-validation.md) | Lint rules above |
| [10-reference-workflow](../10-reference-workflow-preview-review.md) | Add `default` + `cancel` to review + intake checkpoints |
| [05-triggers-only-checkpoint-steps.md](./05-triggers-only-checkpoint-steps.md) | Example YAML includes default/cancel |
| Skill `reference/flow-authoring.md` | Document explicit on_resolve |

---

*End of decision 06.*
