# UI/UX Critique: Notifications — pending items

**Reviewed:** 2026-07-01  
**Snapshots:** notifications-pending-items.png  
**Updated:** 2026-07-01 — P1 kind badges implemented

## Context & intent

`/notifications` is Murrmure’s actionable inbox: gates awaiting human input and run failures that need attention. The header **Needs you (n)** badge and this page should stay in sync. Observer shell resolves gates inline via `GateResolvePanel` on a dedicated state; this snapshot shows the list-only inbox before a gate is opened.

## What works well

- **Page framing is clear.** Title “Notifications” plus subtitle “Actionable inbox — gates and failures” matches shell spec and sets expectation: this is not a generic activity feed.
- **Global count consistency.** Header badge “Needs you 3” aligns with inbox “3 pending” — users get the same number in chrome and on the page.
- **Realistic orchestration copy.** Items use domain language (review loop, orchestrator failure, orchestration validation) rather than placeholder lorem.
- **Scannable card stack.** Each row is a bordered block with title → summary → action, suitable for quick triage on a dark canvas.
- **Dual escape hatches per item.** “Open run” deep-links to run detail (with optional `?gate=`); “Dismiss” supports clearing non-actionable noise — both are appropriate inbox primitives.
- **Observer chrome is present but quiet.** Sidebar spaces, Observer pill, and Logs link keep navigation without turning the page into a wizard.
- **P1 — Kind badges distinguish rows.** Gate (blue), Failed (red), and Validation (amber) badges with CC-08 icons make triage scannable without opening each run.

## Issues & concerns

### Visual design

- ~~**All three items look identical.**~~ **Addressed (P1):** kind badges differentiate gate, failure, and validation rows.
- **No temporal or spatial metadata.** Missing relative time (`created_at`), space name, or session label forces users to open each run to understand context — painful when three spaces are involved (`spc_demo`, `spc_ops` in prototype data).
- **“Open run” is visually weak.** `text-xs` underlined link competes poorly with title; for the primary inbox action it may be overlooked, especially on wide cards with Dismiss top-right.
- **Dismiss placement dominates.** Top-right muted “Dismiss” draws equal attention to destructive/irreversible action as to resolution — risky for gate items where dismissal ≠ resolution.

### UX / usability

- **No inline resolve affordance for gates.** Spec places `GateResolvePanel` on this route when a gate notification is active; in list-only state, gate rows only offer “Open run.” Users may not discover that gates can be resolved without leaving the inbox.
- **No selection or focus model.** With multiple pending gates, unclear which item will surface the resolve panel when user navigates here from the bell — no highlighted row, no “Resolve” button on gate kinds.
- **Dismiss without confirmation.** For gates and failures, one-click dismiss may hide work that still blocks orchestration; no undo or “still pending on hub” warning.
- **Inbox header under-describes content.** “3 pending” counts all kinds equally; a split (“2 gates · 1 failure”) would speed triage.

### Accessibility (visible cues only)

- ~~**Kind conveyed by title text only.**~~ **Addressed (P1):** badge label + icon per kind.
- **Dismiss is a bare text button.** Low contrast and small size may be hard to target; focus ring not visible in snapshot.
- **Link vs button semantics.** “Open run” styled as link may be correct for navigation, but adjacent dismiss-as-button creates inconsistent interaction patterns in the same row.

### Consistency with shell intent

- **Fits observer inbox role.** Page does not author flows or mint grants — aligned with v2 retire-Configure philosophy.
- **Under-delivers on gates-as-primary.** Spec emphasizes gates; UI treats them as generic list rows until user drills into run or hits resolving state (Resolve CTA still missing in list-only state).
- **Profile notification toggles in header.** Email/Desktop checkboxes match phase-15 spec but add chrome weight on a page already about notifications — consider whether they belong in profile menu only on this route.

## Recommendations (prioritized)

1. ~~**Add notification kind badges** — e.g. `Gate`, `Failed`, `Validation` — with distinct color weight (amber for actionable gate, red tint for failure).~~ **Done (P1).**
2. **Show metadata row** on each card: space label, relative time, optional session id (monospace, truncated).
3. **Promote gate actions** — primary “Resolve” on gate rows; keep “Open run” as secondary link.
4. **Split pending summary** in inbox header: gates vs failures count.
5. **Confirm or constrain dismiss** for gate/failure kinds; allow easy dismiss only for informational items.
6. **Snapshot a selected/focused gate row** state to show inbox → resolve panel linkage — see `notifications-resolving-gate`.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Kind badges improve scan; metadata still sparse |
| Readability | 4 | Copy is good; metadata sparse |
| Affordance / clarity | 3 | Kinds distinct; weak primary CTA on gates |
| Dark-theme polish | 4 | Calm, professional card stack |
| Fit for orchestration UX | 4 | Right route and copy; kind-specific treatment started |
