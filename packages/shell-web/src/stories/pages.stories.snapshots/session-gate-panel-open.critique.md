# UI/UX Critique: Session — gate panel open

**Status (CC-02 / CC-12):** Addressed — session gate rail inherits shared `GateHeader` (title, summary, step); lane detail card stacks above gate panel when a run is selected.

**Reviewed:** 2026-07-01 (post button Slot fix + snapshot regen)  
**Snapshots:** session-gate-panel-open.png

## Context & intent

When a session has a pending human gate, the shell should surface validation inline — gate tab/panel on `/sessions/:id`, not only via `/notifications`. Philosophy: gates are protocol checkpoints; views project them without owning orchestration. `GateResolvePanel` renders embedded `GateFormSchema` with Approve/Reject as primary actions.

## What works well

- **Gate panel placement in the right rail** keeps the flowchart visible while the user decides — appropriate for observer workflow (watch graph, act on gate) without modal takeover.
- **"Resolve gate" card hierarchy is clear.** Title, space label ("Demo space"), form field, and paired Approve (primary) / Reject (outline) buttons follow established shell button patterns.
- **Decision mapped to buttons, not a duplicate enum field.** Hiding the `decision` enum and exposing Approve/Reject reduces form noise — good gate UX for binary human validation.
- **Notes field supports free-text context** for approve/reject audit trail — matches review-loop and generic gate contracts.
- **Session graph remains in view** so the user can see which step (e.g. `review` gate node, parallel lanes) is blocked while resolving.
- **Lane detail + gate coexist (CC-12).** Draft lane detail (`run_c1d4e5`, waiting) remains visible above the Human approval card — user sees which lane is blocked while resolving.
- **Gate context copy present.** Title "Review loop — human approval needed", summary "Agent completed draft, waiting for your decision", and `gate:review` step — notification-grade context surfaced on-session.
- **Session logs card persists below gate** — after resolving, user can jump to log explorer without losing session context.

## Issues & concerns

### Visual design

- **Same React Flow white MiniMap/Controls artifact** as active-run snapshot — undermines trust in a moment that demands careful human judgment.
- **Gate card and Session logs card stack without visual grouping.** Two equal-weight cards in the rail; the gate should visually dominate (accent border, "Needs you" strip, or elevated surface) when it blocks progress.
- **No indication which graph node is gated.** `review` shows amber "working" in the graph, but nothing links the right-panel form to that node — user must infer from layout.

### UX / usability

- **~~Gate lacks contextual copy~~** Resolved (CC-02): title, summary, and gate step visible in Human approval card.
- **Reject is outline, not destructive.** Rejecting a gate may abort work; outline styling may under-communicate consequence compared to a secondary destructive treatment or confirm step.
- **No dismiss/snooze/defer.** Some gates must be resolved now, but showing only Approve/Reject with no "Open in notifications" or "View run" link limits navigation for users who need more context first.
- **Header "Needs you 3" while gate is open on-session** — good that action is local, but badge count doesn't decrement visually in the story; relationship between global inbox and session panel is unclear.
- **Tab vs panel model partially demonstrated.** Snapshot shows lane detail + gate cards stacked (not tabs); multiple simultaneous gates still unspecified.

### Accessibility (visible cues only)

- **Field label "notes" is lowercase raw schema name** — should be sentence case "Notes" with optional hint text for purpose.
- **Approve/Reject side-by-side** — logical order is fine; ensure focus trap and loading/disabled states are visible during submit (not shown).
- **Gate panel may be below fold on shorter viewports** while graph consumes vertical space — mobile/small laptop users might miss it.

### Consistency with shell intent

- **Correct layer:** view presents gate form; does not edit orchestration graph — aligned with flow vs view separation.
- **Matches notifications resolve path** (`GateResolvePanel` shared) — consistency win if copy and context are unified.
- **Observer-first preserved** — no wizard or graph editor; human action is bounded to gate form fields.

## Recommendations (prioritized)

1. **~~Pull notification-grade context into gate panel~~** — done (CC-02); add run/session links and relative time if missing.
2. **Visually emphasize blocking gate** — left accent, badge "Awaiting you", or pinned tab above Session logs; de-emphasize logs until gate cleared.
3. **Highlight gated step in flowchart** (pulse border, icon) and scroll/focus graph node when panel opens.
4. **Add secondary actions:** "View run", "Open in notifications", copy gate_id for CLI — supports investigate-then-decide flows.
5. **Review Reject styling** — outline-destructive or confirmation for irreversible gates; keep Approve as sole primary.
6. **Define multi-gate/tab behavior** in spec snapshots — gate tab vs lane detail tab vs logs shortcut.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 3 | Form clear; gate urgency underplayed |
| Readability | 4 | Gate title/summary + lane detail clear |
| Affordance / clarity | 4 | Approve/Reject + lane context obvious |
| Dark-theme polish | 2 | Flowchart overlay glitch persists |
| Fit for orchestration UX | 4 | Right placement and bounded action fit product |
