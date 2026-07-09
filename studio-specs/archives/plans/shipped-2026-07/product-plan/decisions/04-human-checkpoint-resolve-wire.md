# Decision 04 — Human checkpoint resolve wire + dual orchestration patterns

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-1.md § Assumptions #4–5](../plan-review-1.md), review-loop / `resume_data` discussion  
**Related:** [Decision 03 — gate view context](./03-gate-view-context-shape.md), [10-reference-workflow-preview-review.md](../10-reference-workflow-preview-review.md)  
**Blocks:** Phase 02 (engine), 03b (view submit), 06 (shell adapter), 08 (tutorials)

---

## Context

Human checkpoints mid-flow (gate steps, `start.requires_view`) pause a run until a person interacts via a **custom view**. The plan mixed three layers without a clear boundary:

| Layer | Problem |
|-------|---------|
| **Protocol** | `decision: approved \| rejected` + opaque `resume_data` + `form_values` — approval-centric, underspecified |
| **View** | Rich submit: `decision`, `outcome`, `comments`, … |
| **Flow** | `on_resolve.approved/rejected.goto` — only two branches |

This breaks down when:

- Views **collect answers** (not Approve/Reject).
- Review loops use **“Request changes”** as *continue with feedback*, not “fail the run.”
- Authors need **protocol context** (`steps.*.output`) separate from **view UX**.

Additionally, preview-review needs **two documented orchestration styles**:

1. **Flow-owned loop** — engine advances after view submit; same `ses_` + `run_`; each `build` invoke may re-spawn executor with context injected via templates/env.
2. **Agent-owned loop** — one agent session uses `murrmure_wait_for_gate` → read `steps.review.output` → `murrmure_invoke_action(build)` → wait again; same protocol state, explicit agent loop.

### Discussion (2026-07-03)

**Product owner:**

- Core wiring and payload must live in **separate places** (protocol vs view vs shell adapter).
- Views may ask questions or collect information — not only approve/reject gates.
- Review loop: agent should **wait for human answer** and follow a loop with **same session/run context**; not necessarily a new shell agent every round.
- **Both orchestration examples** should appear in docs and tutorials to show the difference.
- **Protocol rename approved:** `disposition` + `output` (replacing `decision` + `resume_data` as the normative wire).

---

## Decision

### 1. Protocol resolve wire (normative)

HTTP path may remain `POST /v1/gates/{gate_id}/resolve` (no rename required in v2).

**Request body (normative v2):**

```typescript
interface GateResolveRequest {
  /** Run control — not domain semantics */
  disposition: "continue" | "cancel";
  /** Step result bag — becomes steps[step_id].output; flow templates and agents read this */
  output?: Record<string, unknown>;
}
```

**Engine behavior on resolve:**

1. Persist gate terminal status (map `continue` → resolved/approved path, `cancel` → rejected/cancelled path for notifications — internal mapping only).
2. Set `exec_context.steps[step_id].output` = merge of:
   ```typescript
   {
     ...input.output,
     disposition: input.disposition,
     resolved_at: ISO8601,
     resolved_by: actor_id,
   }
   ```
3. Apply flow `on_resolve` branching (see §3).
4. Advance run or fail per branch rules.

**Deprecate as normative wire (migrate in phase 02):**

| Legacy | Replacement |
|--------|-------------|
| `decision: approved \| rejected` | `disposition: continue \| cancel` |
| `resume_data` | `output` |
| `form_values` (resolve body) | Fields inside `output` (shell fallback forms only) |

**Backward compat (implementation note):** HTTP handler may accept legacy `decision` + `resume_data` during migration and map to `disposition` + `output`. New docs, views, and tutorials use v2 shape only.

**MCP:** `murrmure_resolve_gate` accepts same `{ disposition, output }`. Human path still resolves via **view submit → shell**, not agent MCP.

---

### 2. Three-layer separation (normative)

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│  View (author)  │     │  Shell adapter   │     │  Protocol (hub/engine)  │
│  submit(params) │ ──► │  map → resolve   │ ──► │  disposition + output   │
│  any shape      │     │  one place       │     │  steps[id].output       │
└─────────────────┘     └──────────────────┘     └─────────────────────────┘
```

#### View submit (view-sdk — ergonomic, unconstrained)

```typescript
// view calls useViewSubmit().submit(params)
submit({ outcome: "changes_required", comments: [{ text: "Fix header" }] });
submit({ budget: 5000, deadline: "Q3" });
submit({ decision: "approved", outcome: "validated" });  // review UX convention
```

View SDK **does not** call hub resolve APIs directly.

#### Shell adapter (ViewCanvasHost — single mapper)

Document in phase 06 / view-sdk host spec:

**Default mapping (preview-review and generic gates):**

| View submit | Shell sends to hub |
|-------------|-------------------|
| Any successful human completion | `disposition: "continue"`, `output: params` (view payload becomes output bag) |
| Explicit cancel / dismiss | `disposition: "cancel"`, `output: params` (optional) |

**Convention (not protocol):** review views may use `outcome: "validated" \| "changes_required"` inside `output`. Flow branches on `output.outcome`, not on `disposition`.

**Start checkpoint (`mode: "start"`):** unchanged — `submit(params)` → `POST /v1/flows/{flow_id}/run { input: params }` (not gate resolve).

#### Protocol + engine

Owns `disposition`, `output`, `exec_context.steps`, journal events, notifications. Domain fields (`outcome`, `comments`, `answers`) live **inside `output` only**.

---

### 3. Flow branching (normative extension for phase 02)

Replace approval-only branching with **output-driven rules** (keep simple aliases for migration):

```yaml
steps:
  - id: review
    gate:
      requires_view: preview-review
      assignees: ["{{input.reviewer}}"]
      on_resolve:
        # Primary v2 shape — branch on output field
        when: output.outcome
        values:
          validated: { goto: done }
          changes_required: { goto: build }
        default: { goto: done }   # optional
        cancel: { fail: true }    # disposition cancel
```

**Preview-review mapping:**

| Human action | View submit (example) | Resolve wire | Branch |
|--------------|----------------------|--------------|--------|
| Approve | `{ outcome: "validated" }` | `continue` + output | `goto: done` |
| Request changes | `{ outcome: "changes_required", comments: [...] }` | `continue` + output | `goto: build` |
| Dismiss / abort run | cancel UX | `cancel` | fail run |

**Important:** “Request changes” is **`disposition: continue`**, not cancel. The loop continues inside the same `run_` and `ses_`.

**Legacy alias (optional, phase 02):** `on_resolve.approved` / `on_resolve.rejected` map to `disposition continue/cancel` for manifests not yet migrated.

---

### 4. Dual orchestration patterns (both first-class in docs)

Both patterns share **the same protocol state**: one `ses_*`, one `run_*` (for declarative loop), growing `exec_context.steps`, human resolves via **view** only.

#### Pattern A — Flow-owned loop (primary tutorial path)

**Who advances:** flow engine after gate resolve + `on_resolve` goto.

```yaml
# preview-review — engine loops build ↔ review
steps:
  - id: build
    invoke:
      action: run_preview_agent
      params:
        feedback: "{{steps.review.output.comments}}"
  - id: review
    gate:
      requires_view: preview-review
      on_resolve:
        when: output.outcome
        values:
          validated: { goto: done }
          changes_required: { goto: build }
```

```text
Human clicks Run → build → gate (view) → human submit
  → engine stores steps.review.output → goto build → invoke again with feedback template
  → gate again with updated steps snapshot in view context
```

**Agent model:** each `build` invoke runs the configured executor (e.g. `shell_spawn`). Agent **chat** may be new each round; **protocol context** is continuous via `session_id`, `run_id`, and `steps.review.output` injected into params / `MURRMURE_INPUT`.

**Best for:** Tutorial 1, non-agent authors, “Run button” Desktop UX.

#### Pattern B — Agent-owned loop (secondary tutorial / skill)

**Who advances:** agent orchestration via MCP between human gate resolves.

```text
agent: invoke(build)
agent: murrmure_wait_for_gate({ run_id })
agent: murrmure_journal_query / read steps.review.output
agent: if output.outcome == changes_required → invoke(build) with feedback
agent: wait_for_gate again …
```

Human still uses **view submit** (ViewCanvasHost). Agent does **not** call `murrmure_resolve_gate` for the human path.

**Best for:** Long-lived agent session, same conversation loop, explicit agent control.

#### Docs / tutorial requirement (normative)

Phase **08** must ship **two tutorial tracks** (or one tutorial with two clearly labeled parts):

| Doc | Shows |
|-----|--------|
| **Tutorial 1a** (or §A) | Flow-owned preview-review — Run in Desktop, engine loop, view submit |
| **Tutorial 1b** (or §B) | Agent-owned preview-review — same view + session, agent `wait_for_gate` loop |

Skill `reference/` must describe when to choose each pattern.

Reference workflow [10](../10-reference-workflow-preview-review.md) remains normative for **human UX (R1–R6)**; add § **Orchestration variants A/B**.

---

### 5. Review loop + agent context (clarification)

| Concern | Mechanism |
|---------|-----------|
| Same **session** correlation | `ses_*` — journal, notifications, Desktop route |
| Same **run** for multi-round review | One `run_*`; `on_resolve` goto `build` (flow-owned) or agent re-invokes inside same run (agent-owned) |
| Same **agent chat memory** | **Not guaranteed by protocol.** Use Pattern B, or an action that re-attaches to the same agent with `session_id` + last `output` |
| Agent **waits for human** | `murrmure_wait_for_gate` (Pattern B) or implicit wait while run is `input-required` (Pattern A — agent may exit after invoke) |
| Human **feedback to next build** | Always via `steps.review.output` (especially `output.comments`) — both patterns |

---

## Philosophy alignment

- **Protocol = kernel** — small resolve: `disposition` + `output`.
- **View = presentation** — any submit shape; no orchestration APIs in views.
- **Shell = adapter** — maps view → protocol in one place.
- **Flow = wiring** — branch rules on `output.*`; supports Q&A and review alike.
- **Custom views are the product** — human path is always view submit, both patterns.

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [02-engine-completion.md](../02-engine-completion.md) | Resolve wire, `steps[id].output` from `output`, `on_resolve.when` branching, legacy alias note |
| [03b-view-sdk.md](../03b-view-sdk.md) | View submit = free params; remove protocol fields from view API; document shell mapping |
| [06-gate-requires-view.md](../06-gate-requires-view.md) | Shell adapter: submit → `{ disposition, output }` |
| [10-reference-workflow-preview-review.md](../10-reference-workflow-preview-review.md) | Pattern A manifest; add § Orchestration A/B; update gate YAML to `when: output.outcome` |
| [08-docs-and-proof.md](../08-docs-and-proof.md) | **Two tutorial tracks** (flow-owned + agent-owned); acceptance notes for both |
| [09-review-synthesis.md](../09-review-synthesis.md) | Resolved Q4 wire + dual orchestration |
| `packages/contracts` | `GateResolveRequest` v2; migration from `decision`/`resume_data` |
| `apps/docs/reference/http-api.md` | Document `disposition` + `output` |
| Skill `reference/mcp.md`, `reference/flows.md` | Pattern A vs B |

---

## Migration notes (implementation)

- `resolveGateV2` today accepts `decision`, `resume_data`, `form_values` — extend to v2 shape; map legacy in HTTP layer.
- Today reject without `on_resolve` may **fail run** — phase 02 must implement goto branching before tutorial proofs.
- Glossary: stop using `resume_data` in author-facing docs; use **`output`** (step result bag).

---

*End of decision 04.*
