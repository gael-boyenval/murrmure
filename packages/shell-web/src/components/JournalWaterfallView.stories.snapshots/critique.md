# UI/UX Critique — JournalWaterfallView (`JournalWaterfallView.stories.snapshots`)

**Snapshots reviewed:** `default.png`, `empty.png`, `pending-gate.png`, `failed-with-retry.png` (4)  
**Component scope:** Inngest-style fallback timeline for headless runs (no declared flow graph) on `/runs/:id` and `/sessions/:id`  
**Role:** Retrieval-style **live feedback**, not primary flowchart — per philosophy, logs remain on `/logs`

---

## Context

When no `flow_id` / graph is available, operators still need observability. `JournalWaterfallView` replays step memo (`journal_replay`) and interleaves raw journal events (`mrmr.step.started`, etc.). Default snapshot shows three steps (plan ✓, draft ✓, review ✗) plus two timestamped events under **Steps** / **Events** sections. Empty snapshot shows cold-start state.

---

## Strengths

| Area | Observation |
|------|-------------|
| **Failure visibility** | Failed step uses red ✗ icon, destructive badge, optional error excerpt, and inline **Retry** CTA. |
| **Step vs event distinction** | **Steps** and **Events** section headers when both layers present; events use monospace timestamps. |
| **Live semantics** | Header **Run progress (inferred)** avoids `/logs` confusion; pulsing green **Live** dot when `isLive`. |
| **Pending gate row** | `input-required` / `gate` / `pending` statuses render `[!]` with gate badge and “awaiting you” copy. |
| **Compact vertical list** | Easy to scan top-to-bottom progression without canvas overhead — appropriate fallback when graph is absent. |
| **Empty state copy** | “No step history yet.” is plain and honest for trigger-only runs that haven’t emitted steps. |
| **Low chrome** | Border + padding container — does not compete with gate tabs or flowchart when those exist. |

---

## Issues by Category

### Remaining gaps (post CC-13)

- No duration per step, space/action metadata — still sparse for deep debugging.
- Journal events show time + type only — `data` payload omitted (may be intentional).
- Empty state does not distinguish **waiting for first event** vs **SSE disconnected** — minor unless connection issues are common.

---

## CC-13 resolved

| Item | Resolution |
|------|------------|
| Retry on failed rows | Inline **Retry** button on failed step rows; wired on Run/Session pages and failed-run prototype |
| Pending gate row type | Distinct gate styling for `pending` / `gate` / `input-required` with helper copy |
| Live SSE indicator | Pulsing green dot + “Live” label via `isLive` prop |
| Section headers | **Steps** / **Events** when both present |
| Rename away from logs | **Run progress (inferred)** replaces “Journal replay” |
| Error excerpt | Optional `error` field on failed step rows |

---

## Severity Table (remaining)

| # | Issue | State | Severity (1–5) | Rationale |
|---|-------|-------|------------------|-----------|
| 1 | Sparse step detail (no duration, space) | Default | **2** | Acceptable for sidebar fallback |
| 2 | Empty state too generic | Empty | **2** | Minor unless SSE issues common |
| 3 | Event payload omitted | Default | **2** | Debug expand is future work |

**Overall assessment:** CC-13 closes the operator recovery loop on the waterfall fallback — failed rows offer Retry, gates read as actionable, live runs show a Live dot, and naming no longer conflates with `/logs`.
