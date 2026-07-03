# UI/UX Critique — GatePanel (`GatePanel.stories.snapshots`)

**Status (CC-02):** Addressed — review and orchestration variants inherit `GateHeader` context (title, step, space, pending time, summary, run/session links).

**Snapshots reviewed:** `review-gate.png`, `orchestration-gate.png` (2)  
**Component scope:** `GatePanel` on `/runs/:id?gate=chk_*` and session gate tabs — human validation when run is `input-required`  
**Variants:** Review gate (default `GateResolvePanel`) vs orchestration gate (`OrchestrationValidateGate` + flowchart preview)

---

## Context

Gates block runs until humans approve. The shell exposes them as **gate tabs** on run/session detail and as primary items in `/notifications`. `GatePanel` routes to either a minimal resolve form or a richer orchestration-review layout with proposed graph preview.

Operators must quickly answer: **what is blocked, why, and what happens if I approve?**

---

## Strengths

| Area | Observation |
|------|-------------|
| **Orchestration variant clarity** | “Review proposed orchestration” title + `agent-proposed` subtitle frames the decision. Mini flowchart with single `plan` node gives spatial context; step detail block (Space, Action, Params) supplies audit-grade specifics. |
| **Consistent resolve affordance** | Both variants end with the same **Resolve gate** card: notes field + **Approve** / **Reject**. Primary/secondary button hierarchy is clear (filled Approve vs outline Reject). |
| **Orchestration consequence copy (CC-03)** | Orchestration variant shows amber callout above Approve: *“Approving binds this orchestration to the session and enqueues the proposed steps.”* — resolves high-stakes framing gap for orch. gate. |
| **Approve prominence** | High-contrast Approve button supports the common happy path without hiding Reject. |
| **Information layering (orch.)** | Graph preview (macro) + param_shape list (micro) matches philosophy: views project protocol state; operator sees both intent and contract. |
| **Dark theme cohesion** | Cards, dot-grid canvas, and monospace step metadata feel consistent with shell observability UI. |

---

## Issues by Category

### “What needs me now?” — review gate variant (Severity: 5)

- **Review gate snapshot is context-free:** title “Resolve gate” only; no run ID, session, step name (`gate:review`), artifact summary, or link to what is being reviewed.
- Operator cannot tell *what* they are approving — only that *something* needs a decision. This is insufficient for audit and erodes trust on `/runs/:id` gate tabs.

### Gate affordance & decision framing (Severity: 4)

- **Approve/Reject without mandatory context:** notes field is optional; no confirmation copy for review gate (“Approving will resume run `run_test` at step `review`”). **Orchestration variant:** consequence callout shipped (CC-03).
- Enum `decision` field is correctly hidden from form (mapped to buttons), but buttons read as generic actions — not “Approve review” / “Reject and stop run”.
- No indication of **blocking duration**, **assignee**, or **who else is waiting**.

### Orchestration preview UX (Severity: 3)

- Single-node graph in a large canvas feels **empty** — lots of dead space; minimap and left toolbar add chrome without utility at this scale.
- Graph controls (zoom/pan) may distract from the decision; for one-step previews, a compact list-first layout might communicate faster.
- `plan` node border color (blue) does not encode status semantics used elsewhere (green completed / red failed).

### Information density (Severity: 3)

- Review gate: **extremely low density** — wide card, single notes input, two buttons. Appropriate for simple gates only if context lives *above* the panel (not visible in isolated snapshot).
- Orchestration gate: better density in the lower metadata list; upper canvas is under-utilized.

### Error / edge states (Severity: 3)

- No snapshots for: submitting/disabled state, validation error, already-resolved gate, or concurrent resolution by another user.
- No visual tie to **Retry** affordance on failed lanes (related operator action on same page).

### Terminology (Severity: 2)

- “Resolve gate” is accurate but operator-facing copy might benefit from step-specific titles (“Review URL check”, “Validate agent plan”) derived from `step_id` or form id.

---

## Prioritized Recommendations

1. **Always show gate context above resolve form:** session/run labels, step_id, space, time pending, and one-line summary of blocked work (even for review gates).
2. **Step-specific primary actions:** “Approve review” / “Reject review” or dynamic labels from gate form metadata.
3. **Orchestration preview — compact mode:** for ≤3 steps, default to stacked step cards; expand to full flowchart only when graph complexity warrants it.
4. **Post-decision affordance:** brief inline confirmation or disabled state after submit; snapshot submitting variant for both gate types.
5. **Cross-link to notifications:** when embedded in run detail, show “Also in Needs you inbox” for discoverability.
6. **Danger styling for Reject** on irreversible gates (optional semantic variant, not only outline).

---

## Severity Table

| # | Issue | Variant | Severity (1–5) | Rationale | Status |
|---|-------|---------|------------------|-----------|--------|
| 1 | No subject/context on review gate | Review | **5** | Operator cannot answer “what needs me?” | **Resolved** — CC-02 GateHeader |
| 2 | Generic Approve/Reject without consequence copy | Both | **4** | High-stakes actions need framing | **Resolved (orch.)** — CC-03 callout; review gate still open |
| 3 | Missing submitting/error/resolved states in snapshots | Both | **3** | Incomplete operator lifecycle | Open |
| 4 | Orchestration canvas under-filled | Orch. | **3** | Wasted attention, weak scan path | Open |
| 5 | No pending duration / assignee | Both | **3** | Triage priority unclear in inbox context | Open |
| 6 | Notes field single-line, full-width | Both | **2** | Minor ergonomics for long rejection notes | Open |
| 7 | “Resolve gate” generic title | Review | **2** | Fixable with dynamic title | Open |

**Overall assessment:** **Orchestration gate** is directionally aligned with product intent — preview + resolve. **Review gate** snapshot fails the operator clarity bar in isolation and must assume surrounding page context not captured here. Gate **affordances (buttons)** are obvious; **gate subject** is not.
