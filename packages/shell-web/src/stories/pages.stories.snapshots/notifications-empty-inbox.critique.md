# UI/UX Critique: Notifications — empty inbox

**Reviewed:** 2026-07-01  
**Snapshots:** notifications-empty-inbox.png

## Context & intent

`/notifications` is the global actionable inbox — gates primary, run failures secondary. Philosophy separates notifications from logs: "Needs you" in the header persists across refresh; this page is where users resolve or dismiss items. Empty state should reassure and explain the contract when nothing is pending **for this view**.

This snapshot shows **aligned counts**: header "Needs you" with no badge (0 pending) and inbox subtitle "0 pending" — single mock notification query source (CC-04 fix).

## What works well

- **Page title and subtitle set expectations.** "Notifications" with "Actionable inbox — gates and failures." tells users this is not a log tail or session list — aligned with product boundary (live flowchart elsewhere, retrieval in `/logs`).
- **Empty copy is calm and human.** "Nothing needs you right now." reduces alert fatigue — appropriate for observer shell when no gates or failures demand action.
- **Inbox card frames the list.** "Inbox" title and "0 pending" count give a scannable container that will scale when items arrive — consistent with card patterns elsewhere.
- **Header badge and inbox count match.** No contradictory "Needs you 3" vs "0 pending" — prototype fixture hygiene restored.
- **Layout is focused.** Narrow `max-w-3xl` column avoids stretching notification rows across ultra-wide monitors — good for reading titles and summaries when inbox is populated.
- **Global chrome present** (spaces sidebar, Observer badge, profile/notification header) — user retains navigation context while checking inbox.

## Issues & concerns

### Visual design

- **Large empty card with minimal content** — vast muted interior below one line of text feels sparse, not intentionally calm; empty state could use icon, tighter vertical rhythm, or reduced card height.
- **No visual relationship between header bell and page inbox** when populated — duplicate labels ("Needs you" vs "Inbox") without explaining scope if filters are added later.

### UX / usability

- **Empty state lacks guidance on what appears here.** New users may not know gates and failures land here vs session gate tabs vs desktop push — one sentence ("When a gate blocks or a run fails, it shows up here.") would teach the model.
- **No link to active sessions or recent failures** when empty — optional "Browse sessions" or "View logs" helps observers who arrived from habit, not a notification.
- **Dismiss and resolve flows not previewed** — empty story is fine, but paired docs should note inbox item anatomy (title, summary, Open run, Dismiss) for when count > 0.
- **Email/Desktop checkboxes in header** — notification preferences visible on every page; on empty inbox, user might expect channel settings here.

### Accessibility (visible cues only)

- **Empty message contrast** (`text-muted-foreground`) is readable but low-emphasis — acceptable for secondary reassurance, not primary alert.
- **"0 pending" in description slot** — screen readers may announce before body; ensure live region updates when count changes from SSE invalidation.

### Consistency with shell intent

- **Correct route purpose** — actionable inbox, not configure, not logs — matches phase 07 spec.
- **Header badge + page inbox share one pending source** in this story — philosophy satisfied for empty fixture.
- **Observer-only:** empty state correctly avoids CTAs to create gates or fix failures in-app — no false affordances.

## Recommendations (prioritized)

1. **Enrich empty state:** short explainer of gates + failures, optional illustration/icon, links to Sessions and Logs.
2. **Unify terminology** — pick "Needs you" or "pending" for both header and inbox subtitle consistently in copy docs.
3. **Compact empty card** or center the message without oversized empty chrome — reduce "void" feeling on large displays.
4. **Document legitimate divergence** if filters exist (e.g. by space) — show active filter chip on page when header is global.
5. **Add snapshot pair** in critique set: empty (0/0) vs populated inbox for contrast — validates list density and resolve panel handoff.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Title/subtitle good; counts aligned |
| Readability | 4 | Empty copy clear and concise |
| Affordance / clarity | 3 | Thin onboarding; counts fixed |
| Dark-theme polish | 4 | Calm, consistent shell chrome |
| Fit for orchestration UX | 4 | Right page role; fixture sync done |
