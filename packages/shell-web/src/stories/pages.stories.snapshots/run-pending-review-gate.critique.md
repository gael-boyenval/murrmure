# UI/UX Critique: Run — pending review gate

**Status (CC-02):** Addressed — gate panel shows notification-grade header context via shared `GateHeader`.

**Reviewed:** 2026-07-01  
**Snapshot:** run-pending-review-gate.png  
**Route:** `/runs/:id` — human review gate blocks progress

## Context & intent

When a flow step reaches a human gate, the shell must make **action unmistakable** without becoming a configuration surface. Gates are protocol-owned checkpoints; the default resolve UX uses embedded `GateFormSchema` (`GateResolvePanel`). This state represents a review gate (e.g. approve draft) while the run waits. Header "Needs you" and `/notifications` should feel connected to the same obligation.

## What works well

- **Gate resolve panel is visually separated** from the flowchart card — clear "now do this" zone below observability.
- **Primary Approve vs. secondary Reject** follows conventional destructive/safe button hierarchy (filled white primary, outline reject).
- **Space label under title** ("Demo space") orients the user to which workspace owns the gate — aligns with cross-space session model.
- **Flowchart remains visible above the gate.** User can see `review` node in yellow/working while deciding — supports "views project protocol state."
- **Observer shell chrome unchanged.** No spurious setup wizards; mutation limited to gate decision.

## Issues & concerns

### Visual design

- **No visual link between `review` node and Resolve gate panel.** The graph and form feel like two unrelated blocks; a highlight on the gated node or connector affordance would tie them together.
- **Gate card lacks emphasis border.** Philosophy treats gates as primary notifications; the panel uses the same neutral card treatment as resolved gates elsewhere — missed opportunity for amber/accent "needs you" framing.
- **Same minimap white box** as in-progress state — visual noise on a page where attention should funnel to Approve/Reject.

### UX / usability

- **Run header still shows `working`.** A pending human gate is a distinct lifecycle; `waiting`, `gate_pending`, or similar would set expectations and match notification copy ("human approval needed").
- **No gate title or summary.** Panel says "Resolve gate" only — missing human context ("Review loop — agent completed draft") that appears in notification fixtures.
- **Raw field label `notes`.** Schema-driven but unfriendly; should read "Notes (optional)" or gate-specific prompt.
- **Vertical stack requires scroll** on shorter viewports — flowchart + form may push Approve below the fold; spec also mentions `?gate=chk_*` tab deep-linking not reflected here.
- **Disconnect from header badge.** "Needs you 3" does not indicate *this* gate is one of them; no in-page anchor like "You were notified 12m ago."
- **Decision enum hidden from UI.** Form has approve/reject enum but only buttons expose it — fine, but no confirmation on Reject (destructive).

### Accessibility (visible cues only)

- **Notes input is single-line** in appearance — may underserve reviewers who need longer rationale; no visible required-field cues.
- **Button pair relies on position and fill** for primary action; labels are clear text.

### Consistency with shell intent

- **Correct: gate UX on run page, not Configure.** Matches observer + CLI-first mutation boundary.
- **Gap vs. notifications flow.** `/notifications` resolve panel and run-page gate should share visual language and copy; this feels generic.
- **Anti-pattern risk:** timeline-style gate history is absent (good); but gate tab routing from spec is not demonstrated.

## Recommendations (prioritized)

1. **Add gate headline + summary** from notification/journal payload above the form ("Review loop — human approval needed").
2. **Change run badge to gate-aware state** (`waiting` / `awaiting you`) and sync with header Needs you count context.
3. **Highlight gated node** in flowchart (border glow, icon) and scroll-into-view when gate panel mounts.
4. **Apply gate-emphasis card styling** (accent border, optional icon) consistent with notification resolve UI.
5. **Humanize form labels** via schema display names; use textarea for notes.
6. **Confirm Reject** with lightweight dialog or inline warning — irreversible for the waiting run.
7. **Consider gate tab or sticky resolve bar** so Approve stays visible while scanning the graph.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 3 | Form clear but competes with graph; weak gate emphasis |
| Readability | 3 | Generic titles; raw field names |
| Affordance / clarity | 3 | Approve/Reject clear; missing why/what context |
| Dark-theme polish | 3 | Consistent shell; minimap and neutral gate card |
| Fit for orchestration UX | 4 | Right page, right actions; needs notification parity |
