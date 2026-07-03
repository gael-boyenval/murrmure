# UI/UX Critique: Run — in progress

**Reviewed:** 2026-07-01  
**Snapshot:** run-in-progress.png  
**Route:** `/runs/:id` — live flowchart, working lifecycle

## Context & intent

This page is the primary **live flight tracker** for a single run. Philosophy and shell spec position the flowchart as default observability: declared graph + step progress, parallel lanes in-graph, SSE-backed updates. The shell observes; it does not author. Users land here from space home, sessions, or notifications to see where work is and whether intervention is needed.

## What works well

- **Flowchart-first layout.** The graph dominates the viewport — correct priority over journal tail or logs for a run with a declared `flow_id`.
- **Parallel lane visualization.** Fork/join with labeled lanes (`Research`, `Draft`) communicates matrix orchestration at a glance; green/red/yellow borders map to completed/failed/working per spec.
- **Compact run header.** Title, monospace `run_id`, lifecycle badge, and "View session" link establish identity without wizard chrome.
- **Gates section below the canvas.** Separates historical gate resolution from live graph — appropriate for observer mode; resolved gate as underlined link is scannable.
- **Global chrome is consistent.** Sidebar spaces, "Needs you 3", Observer badge, and Logs link match shell intent for cross-session awareness.
- **React Flow controls present.** Zoom/pan affordances and minimap support large graphs without leaving the page.

## Issues & concerns

### Visual design

- **Minimap is a harsh white rectangle** on an otherwise dark canvas — breaks Vercel-inspired dark polish and draws the eye away from lane status.
- **Large empty canvas area** below the graph nodes; the layout feels sparse rather than "in progress" — no pulse, spinner, or live-event strip to signal activity.
- **Lane border semantics are undocumented.** Green/red/yellow are intuitive but unlabeled; first-time users may not connect colors to lifecycle without a legend or tooltip.
- **"working" badge is neutral outline** while a lane is visibly failed (Draft, red). Visual tension between header state and graph state.

### UX / usability

- **Header lifecycle contradicts graph.** Run badge says `working` but `Draft` lane shows failure — spec calls for `partial_failure` at session level; at minimum the run header should reflect partial failure or blocked-on-lane state.
- **No selected-lane detail.** Clicking a lane should surface run id, last event, or error in a side panel (session split-pane pattern); the graph alone does not explain *why* Draft failed.
- **Missing flow context.** No flow name (`Multi-agent orchestrator`), space, or start time — hard to disambiguate when many runs are active.
- **"View session" is easy to miss.** Underlined text competes weakly with the graph; session is the cross-space correlation noun in philosophy.
- **Resolved gate link lacks outcome.** `gate_review_01 — resolved` does not show approve/reject or timestamp — useful for audit but thin for reassurance.

### Accessibility (visible cues only)

- **Color-only lane status** (green/red/yellow borders) may fail for color-blind users; no icons or text labels on nodes beyond step names.
- **Minimap contrast** (white on dark) is strong but adjacent control cluster is small — may be hard to target.

### Consistency with shell intent

- **Aligns with "flowchart = live feedback."** Correct surface vs. `/logs` retrieval.
- **Observer-appropriate.** No inline mutation except navigation links.
- **Gap vs. session page.** Spec describes `/sessions/:id` split-pane (flowchart + lane detail); this run-only view omits lane detail that would clarify partial failure.

## Recommendations (prioritized)

1. **Reconcile header badge with graph truth** — show `partial_failure`, `blocked`, or lane-level subtitle when any lane is failed while run continues.
2. **Add lane selection → detail strip or panel** with error summary, relative time, and link to filtered logs.
3. **Restyle minimap** to dark-theme tokens (charcoal fill, muted border) so it recedes.
4. **Show flow name + started-at** under the run id; optionally space badge when cross-space.
5. **Add subtle live indicator** (SSE connected dot, "Updated 2s ago") to reinforce observer-as-flight-tracker.
6. **Legend or node badges** — small lifecycle text on lanes, not color alone.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Graph correctly dominant; minimap distracts |
| Readability | 3 | Lane colors clear; header vs. graph mismatch confuses |
| Affordance / clarity | 3 | No lane detail, weak session link, missing flow context |
| Dark-theme polish | 3 | Canvas good; minimap and empty space hurt |
| Fit for orchestration UX | 4 | Strong live-graph story; needs partial-failure vocabulary |
