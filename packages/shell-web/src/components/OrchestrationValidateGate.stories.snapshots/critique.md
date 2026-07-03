# UI/UX Critique — OrchestrationValidateGate

**Snapshot reviewed:** `default.png`  
**Component role:** Human approval surface when an agent MCP-pushes a session-scoped orchestration graph before bind. Combines graph preview (`RunFlowchartView`) with gate resolution (`GateResolvePanel`).  
**Product spec:** Gate resolve via embedded `GateFormSchema` (shell spec § Notifications & gates); graph preview reuses phase 09 `RunFlowchartView`.

---

## Context

This is a high-stakes gate: approving binds an agent-proposed multi-step orchestration to the session. The UI must help the reviewer understand **what will run**, **where**, and **with what inputs**, then record an explicit approve/reject decision with optional notes.

The snapshot shows a two-card layout: **Review proposed orchestration** (manifest name “agent-proposed”, flowchart `plan → review`, step detail list) and **Resolve gate** (notes field, amber consequence callout, Approve / Reject).

**Shipped (CC-03):** Approve consequence copy — *“Approving binds this orchestration to the session and enqueues the proposed steps.”* — appears in an amber callout above Approve, linked via `aria-describedby`.

---

## Strengths

1. **Two-pane mental model** — Separating “understand the proposal” (top card) from “make a decision” (bottom card) matches the review-then-resolve workflow and reduces accidental clicks.
2. **Dual representation** — Flowchart plus structured step list serves both visual and detail-oriented reviewers; param shapes and expectations are exposed for the `plan` step.
3. **Correct action hierarchy** — Solid **Approve** primary and outline **Reject** secondary follows gate UX conventions (affirmative action prominent, destructive/reject still one click away).
4. **Reuse of RunFlowchartView** — Consistency with `/sessions/:id` and `/runs/:id` graph language helps users who already navigated lane flowcharts.
5. **Card framing** — shadcn `Card` boundaries create scannable regions on an otherwise dense dark canvas.
6. **Approve consequence callout (CC-03)** — Amber-bordered copy above Approve explains bind/enqueue stakes; `aria-describedby` links Approve to the callout for screen readers.

---

## Issues

### Visual

| Issue | Detail |
|-------|--------|
| Graph canvas dominance | The React Flow preview occupies most of the top card while showing only two minimal nodes; large empty grid + minimap feels sparse and “prototype-like.” |
| Node styling minimalism | `plan` and `review` nodes are plain boxes with no status color, lane hints, or gate iconography—hard to distinguish invoke vs. gate at a glance. |
| Step list redundancy | Text block below the graph repeats information already implied by nodes; monospace `step_id` headers add visual noise without strong hierarchy. |
| Resolve panel label casing | Field label `notes` is lowercase raw schema name; elsewhere (e.g. ReviewParamsView) labels use Title Case (`Topic *`). |

### UX

| Issue | Detail |
|-------|--------|
| ~~Consequences not explicit~~ | **Resolved (OVG-01 / CC-03):** Amber callout above Approve states bind + enqueue consequence; linked to Approve via `aria-describedby`. |
| Agent provenance weak | Subtitle “agent-proposed” is easy to miss; no timestamp, agent id, or session link for audit context. |
| Reject is low-friction | One click Reject with no confirmation or required reason—risky for irreversible dismissals depending on hub semantics. |
| Notes field purpose unclear | Optional `notes` with no placeholder or helper text; reviewers may skip documentation of why they approved/rejected. |
| Graph interactivity ambiguous | Zoom controls and minimap suggest navigation, but preview graph may not need full interactive chrome for two nodes—adds cognitive load. |
| Missing space context in resolve card | Story gate omits `space_label`; in production, hidden-space rules (spec §6.4) must surface “Private space” without leaking nav. |

### Accessibility

| Issue | Detail |
|-------|--------|
| Graph not accessible | Flowchart is inherently visual; no textual summary or skip link for keyboard users. Partial mitigation: Approve `aria-describedby` links to consequence callout (CC-03). |
| Approve/Reject not in a form | Buttons trigger async handlers outside a `<form>`; Enter key behavior and field association may be inconsistent. |
| Notes input label | Raw `notes` lacks human-readable label and `aria-describedby` for optional vs. required. |

### Consistency

| Issue | Detail |
|-------|--------|
| GateResolvePanel shared pattern | Same panel used elsewhere (GatePanel, notifications resolve); good, but orchestration gate may need richer copy than generic “Resolve gate.” |
| vs. GatePanel snapshots | Dedicated gate panels (`review-gate`, `orchestration-gate`) may set user expectations this composite view should align with—verify title/subtitle parity. |
| Param display format | `api_key: string, count: number` is developer-facing; ProfileMenu/ReviewParamsView target operator-friendly language. |

---

## Prioritized Recommendations

### P0 — Must fix before ship

1. ~~**Add consequence copy above Approve**~~ — **Done (CC-03):** “Approving binds this orchestration to the session and enqueues the proposed steps.”
2. **Humanize field labels** — Map schema `notes` → “Notes (optional)” with placeholder “Why you approved or rejected…”
3. **Provide non-visual graph summary** — Ordered list or `aria-label` on Approve summarizing step count, actions, and spaces.

### P1 — Should fix soon

4. **Enrich agent-proposed header** — Show manifest name + session/run deep link + relative time.
5. **Reject confirmation or required note** — Modal or inline prompt when Reject clicked without notes (configurable by gate severity).
6. **Gate node visual distinction** — Icon or border treatment for `action: gate` nodes in preview graph.
7. **Collapse or compact step list** — Accordion per step, or show list only when graph has >3 nodes.

### P2 — Nice to have

8. **Read-only param values** — When agent proposes concrete params (not just shapes), show values with redaction for secrets.
9. **Diff vs. current session graph** — Highlight net-new steps if a graph already exists.
10. **Submitting state snapshot** — Disable buttons + spinner during `onSubmit` (see GateResolvePanel `submitting` pattern).

---

## Severity Table

| ID | Finding | Severity | Effort | Status |
|----|---------|----------|--------|--------|
| OVG-01 | Approve consequences not explained | ~~**Critical**~~ | Low | **Resolved** — CC-03 consequence callout shipped |
| OVG-02 | Graph inaccessible to screen readers | **High** | Medium | Partial — `aria-describedby` on Approve |
| OVG-03 | Reject lacks guardrails | **High** | Medium | Open |
| OVG-04 | Agent provenance / audit context thin | **Medium** | Medium | Open |
| OVG-05 | Preview graph UI oversized for small graphs | **Medium** | Low | Open |
| OVG-06 | Raw schema field labels (`notes`) | **Medium** | Low | Open |
| OVG-07 | Gate vs. invoke nodes visually identical | **Medium** | Medium | Open |
| OVG-08 | Redundant graph + list presentation | **Low** | Medium | Open |

---

## Snapshot Coverage Gaps

- Submitting / disabled button state
- Reject confirmation flow
- Gate with hidden space label (spec §6.4)
- Larger orchestration graphs (fork/join, matrix lanes)
- Error state on failed `onSubmit`
