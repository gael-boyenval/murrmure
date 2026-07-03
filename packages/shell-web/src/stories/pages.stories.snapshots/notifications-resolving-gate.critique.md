# UI/UX Critique: Notifications — resolving gate

**Reviewed:** 2026-07-01  
**Snapshots:** notifications-resolving-gate.png  
**Updated:** 2026-07-01 — P1 active row highlight + list↔panel linkage

## Context & intent

When a pending notification is a gate, `/notifications` embeds `GateResolvePanel` (via `GatePanel`) above the inbox so humans can approve or reject without leaving the actionable inbox. `GateFormSchema` drives fields; default form includes optional `notes` plus Approve/Reject decisions mapped to protocol resolve.

## What works well

- **Resolve panel placement matches spec.** Gate UI sits above inbox — correct information architecture for “act here, then move on.”
- **Clear panel title and space context.** “Resolve gate” with “Demo space” subline orients user to which workspace owns the gate.
- **Primary/secondary button pairing.** White-filled Approve vs outline Reject follows shell button conventions and makes the happy path obvious.
- **Form stays minimal.** Single optional notes field avoids wizard sprawl — appropriate for default `review.v1` schema.
- **Inbox remains visible below.** User retains situational awareness of other pending items while resolving one gate.
- **Consistent page chrome.** Same header, sidebar, and Needs you count as list-only state — predictable environment.
- **P1 — Active row linked to panel.** Matching gate row gets primary accent border, “Resolving” badge, inset left bar, and connector line to the panel ring; dismiss disabled on active row.
- **P1 — Kind badges in inbox.** Gate / Failed / Validation badges remain visible while resolving, preserving triage context for other rows.

## Issues & concerns

### Visual design

- ~~**No visual link between panel and inbox row.**~~ **Addressed (P1):** panel ring, connector line, and highlighted inbox row with `Resolving` badge.
- **Resolve card vs inbox cards share similar weight.** Both use bordered cards on the same vertical rhythm; active gate row is now elevated but panel could use stronger sticky/elevation treatment.
- **Raw field label “notes”.** Schema-driven `field.name` as label reads developer-facing, not human (“Notes (optional)” or “Comment”).
- **Empty notes input with no placeholder.** Blank field gives no guidance on what belongs in notes for audit trail.

### UX / usability

- ~~**Ambiguous which gate is open.**~~ **Addressed (P1):** active row highlight and Resolving badge identify the bound gate.
- **Pending count unchanged while resolving.** Header and inbox still show “3 pending” even though user is actively resolving one — count semantics unclear (resolved-but-not-dismissed?).
- **No gate/run context in panel.** Missing run title, flow name, gate id, or summary from notification — user must remember why approval is needed.
- **No cancel or collapse.** Once panel is open, no visible way to defer resolution and return to list-only view without submitting.
- **`GatePanel` graph not shown.** Production `GatePanel` can pass run graph for orchestration validation gates; snapshot shows bare `GateResolvePanel` — validation gates lose pipeline preview that would inform Approve/Reject.
- ~~**Dismiss still available on all rows.**~~ **Addressed (P1):** dismiss disabled on the row bound to the open gate.

### Accessibility (visible cues only)

- **Approve/Reject are adjacent equal-width actions.** Visual hierarchy helps sighted users; screen reader order (notes → Approve → Reject) is fine, but Reject lacks destructive styling beyond outline variant.
- **Label `notes` lowercase** may be announced awkwardly; humanized labels improve comprehension.
- **Active row uses `aria-current`.** Screen readers can identify which notification is being resolved.

### Consistency with shell intent

- **Correct observer mutation surface.** Gate resolve is an allowed human-in-the-loop action on protocol — not flow authoring.
- **Views stay separate.** No custom view iframe here; schema form fallback is appropriate for shell-owned resolve.
- **Underuses orchestration context.** Philosophy: “gates and custom UI” — built-in form is fine, but orchestration-validation gate (#3 in inbox) especially needs graph or step summary in panel.

## Recommendations (prioritized)

1. ~~**Highlight active inbox row** when its gate is open — accent border, background, or “Resolving” badge; scroll into view on open.~~ **Done (P1).**
2. **Enrich panel header** with notification title, run link, flow name, and gate type (human review vs orchestration validation).
3. **Humanize schema labels** and add placeholders from `GateFormSchema` metadata when available.
4. **Show `RunFlowchartView` or compact step strip** inside `GatePanel` for validation gates (as production route supports via graph query).
5. **Add “Defer” / collapse** to hide panel without resolving; keep item in inbox.
6. ~~**Disable dismiss** on the row currently bound to the open gate; decrement or annotate pending count during resolve.~~ **Done (P1):** dismiss disabled on active row.
7. **Style Reject with destructive variant** when protocol treats rejection as terminal.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Panel tied to active row; panel elevation still flat |
| Readability | 3 | Minimal form; lacks gate context |
| Affordance / clarity | 4 | Active gate identifiable; decision context still thin |
| Dark-theme polish | 4 | Consistent cards and buttons |
| Fit for orchestration UX | 3 | Right pattern; needs context + graph for validation |
