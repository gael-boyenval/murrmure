# Decision 07 — User-facing session vs run

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-1.md § Assumptions #7](../plan-review-1.md)  
**Related:** [10-reference-workflow-preview-review.md](../10-reference-workflow-preview-review.md), [philosophy.md](../../../current/product/philosophy.md)  
**Blocks:** Phase 06/08 (shell copy, tutorials), docs, skill

---

## Context

Murrmure protocol distinguishes:

| ID | Role |
|----|------|
| **`ses_*` (session)** | Correlation container — one “unit of work” humans track over time (journal, notifications, Desktop history) |
| **`run_*` (run)** | One execution of a flow graph — step state, checkpoints, `exec_context` |

For review-loop workflows ([decision 05](./05-triggers-only-checkpoint-steps.md)), **one session** typically has **one run** that **loops at checkpoint steps** (build ↔ review). Humans experience a single ongoing job, not “a new run every round.”

The plan and shell currently mix both nouns in URLs, notifications, and docs (`/sessions/…`, `/runs/…`, “Run failed”), which confuses authors and end users.

### Discussion (2026-07-03)

**Product owner:** Follow recommendation — human-facing **session / workflow title**; **`run_` admin/debug only**; agents keep both ids.

---

## Decision

### 1. User-facing language (normative)

| Audience | Primary noun | Show `run_*`? |
|----------|--------------|---------------|
| **End user / custom view path** | **Session** or **workflow title** (flow name, session title) | **No** (unless debug flag) |
| **Workflow author (tutorials, skill)** | **Session** = “the job”; explain run as implementation detail in advanced section | Minimal |
| **Operator / admin shell** | Session + **run** in flowchart, run detail, failure diagnostics | **Yes** |
| **Agents / MCP / hooks** | Both `session_id` and `run_id` | **Required** |

**Copy rules:**

- Prefer **“Preview review”**, **“Session”**, or session **title** in headers, notifications, checkpoint chrome, tutorials.
- Avoid **“Run”** as the primary label when the user is inside a **custom view** (ViewCanvasHost).
- **“Run failed”**, step graph, lane detail, `/runs/:id` — **admin/operator mode** only ([philosophy § North star](../../../current/product/philosophy.md#north-star-non-negotiable--2026-07-03)).

### 2. Routing / UX (normative intent)

| Route | Primary human path |
|-------|-------------------|
| `/sessions/:id` | Session home; pending checkpoint → ViewCanvasHost **within session context** |
| `/runs/:id` | **Operator** run detail + flowchart — not default end-user landing |

When a checkpoint is pending, deep links and notifications should land users on **session + checkpoint view**, not require them to understand `run_`.

`run_id` remains in view context ([decision 03](./03-gate-view-context-shape.md)) and APIs for agents; views **must not** display raw `run_` to end users by default.

### 3. Review loop mental model (docs)

Document consistently:

```text
One session  = one review effort (e.g. “Validate homepage preview”)
One run      = engine executing that effort (often single run with checkpoint loops)
Each round   = same session, same run — new steps.*.output, not a new “job”
```

Tutorial **08-T1** and reference workflow **10** use **session** language in user-facing steps; mention `run_id` only in agent/MCP sections ([decision 04](./04-human-checkpoint-resolve-wire.md) Pattern B).

### 4. Parallel runs exception

When a session has **multiple sibling runs** (parallel lanes), operator UI may show run labels (“Lane A / Lane B”). End-user custom views still lead with **session title**; lane disambiguation is view-authored or admin flowchart — not raw `run_` ids.

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [08-docs-and-proof.md](../08-docs-and-proof.md) | Tutorial copy: session-first |
| [10-reference-workflow](../10-reference-workflow-preview-review.md) | User outcome § session; run in protocol table only |
| [06-gate-requires-view.md](../06-gate-requires-view.md) | Routing: checkpoint via session context |
| `shell-web` | ViewCanvasHost chrome: session/title not “Run #…” |
| Skill + `apps/docs/guide/*` | Glossary: Session (human) vs Run (operator) |
| `index.md` glossary (future) | Add session/run user-facing rule |

---

*End of decision 07.*
