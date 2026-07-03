# UI/UX Critique: Run — failed with retry

**Reviewed:** 2026-07-01  
**Snapshot:** run-failed-with-retry.png  
**Route:** `/runs/:id` — failed run, journal replay fallback, retry affordance

## Context & intent

When a run has no declared graph (or graph unavailable), the shell falls back to **`JournalWaterfallView`** — Inngest-style step list from journal replay. Failed runs should surface **legible failure** (protocol vs. orchestration vs. implementation) and offer **`POST /v1/runs/{id}/retry`** (new run, `reference_run_ids`). Desktop push and notifications include `mrmr.run.failed`; this page is the recovery destination.

## What works well

- **Run progress (inferred) is the correct fallback** when flowchart data is absent — aligns with spec and philosophy (logs retrieval vs. live graph).
- **Step status iconography** — `[✓]` / `[x]` brackets with semantic badges make the failure point obvious (`invoke:agent`).
- **Failed lifecycle badge on run id** (`run_fail99`, `failed`) — immediate status without reading the list.
- **Inline Retry on failed step row (CC-13)** — recovery action adjacent to `invoke:agent` failure with error excerpt.
- **Empty gates card states honestly** — "No gates on this run." avoids implying a hidden approval step.
- **Calm layout.** Less visual noise than flowchart states; failure story is linear and scannable.

## Issues & concerns

### Visual design

- **Retry uses outline variant** — for the primary recovery action on a failed run, visual weight is low compared to gate Approve (filled primary elsewhere).
- **Large vertical whitespace** between journal card and gates card, then Retry — page feels unfinished rather than intentionally sparse.
- **Empty Gates card occupies full width** for a single muted sentence — visual weight disproportionate to content.

### UX / usability

- **No error message or journal excerpt.** User sees `failed` but not *why* (stderr, timeout, response schema mismatch) — violates "legible failures" product goal.
- **Technical step id `invoke:agent`.** Should show human label, space, action, or last journal event type.
- **Retry semantics unexplained.** Spec: retry creates a **new run** with references — UI does not say "Retry creates run_fail99-r1" or link forward after click.
- **No logs deep link.** Header "Logs" is global; missing "View full journal for this run" filtered shortcut.
- **Missing temporal context** — no started/ended time, duration, or retry count (fixture mentions "3 retries" in notification summary).
- **Disconnect from notification narrative.** Attention item says "failed at plan step" but replay shows `plan` completed and `invoke:agent` failed — copy inconsistency undermines trust.
- **View session link present but lane/session context thin** — failed orchestrator runs often need session-level partial retry vs. whole-run retry; not distinguished.

### Accessibility (visible cues only)

- **Failure indicated by red badge and `[x]`** — reasonable dual cue; error detail would help screen reader users who cannot infer cause from step name alone.
- **Retry button label alone** — no aria-visible description of outcome (new run).

### Consistency with shell intent

- **Matches headless / no-graph path** in spec — good alternative to flowchart.
- **Observer + targeted mutation** — Retry is appropriate; no spurious reconfigure.
- **Gap:** partial failure on session page shows lane retry; this run-level page does not clarify single-step vs. full-run retry scope.

## Recommendations (prioritized)

1. **Surface failure reason** from journal — last error line, HTTP status, or artifact link; expandable detail block under failed step.
2. **Promote Retry to primary button** (filled) with subcopy: "Starts a new run referencing this one."
3. **Humanize step labels** — map `invoke:agent` to "Invoke agent in Demo space" or similar from run metadata.
4. **Add run timestamps + duration** in header; show retry attempt count if known.
5. **Link to filtered logs** (`/logs?run=run_fail99`) beside Retry.
6. **Collapse empty Gates section** or omit card when count is zero.
7. **Align notification copy with replay steps** in fixtures and production data.
8. **After retry (future state)** show reference run lineage — `retried_from run_fail99`.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Failure step clear; Retry underweighted |
| Readability | 3 | Status clear; cause and labels missing |
| Affordance / clarity | 2 | Retry present but opaque; no error detail |
| Dark-theme polish | 4 | Clean, low-noise failure state |
| Fit for orchestration UX | 3 | Correct fallback pattern; weak recovery story |
