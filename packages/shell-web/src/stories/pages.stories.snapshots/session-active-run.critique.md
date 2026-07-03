# UI/UX Critique: Session — active run

**Reviewed:** 2026-07-01 (post button Slot fix + snapshot regen)  
**Snapshots:** session-active-run.png

## Context & intent

This is the primary live observability surface for Murrmure: `/sessions/:id` with a declared flow graph, parallel lanes, and run selection. Philosophy and shell spec position the flowchart as the **flight tracker** — live progress, not a log replay. Lane click should select a run and surface lane detail in the right pane; the shell observes, it does not author orchestration.

## What works well

- **Session identity is scannable.** Title "Review loop session" plus monospace `ses_review_loop` and an outline "active" badge establish the unit of work immediately — aligned with session as core protocol noun.
- **Split layout direction is correct.** Main column for graph + runs, fixed-width right rail for contextual panels matches the spec's split-pane intent and scales on large viewports (`lg:flex-row`).
- **Flowchart communicates parallel structure.** Fork/join with labeled lanes ("Research", "Draft") and color-coded borders (green completed, amber working, red failed) make matrix parallelism legible without opening logs.
- **Runs card reinforces correlation.** `run_8f3a2b` / `run_c1d4e5` with lifecycle badges and selection highlight (`run_c1d4e5` focused) ties list state to graph selection — useful when many lanes exist.
- **Lane detail panel (CC-12).** Selecting `run_c1d4e5` surfaces a right-rail **Lane detail** card: lane title, lifecycle badge (`waiting`), run link, space, last step (`invoke:agent`), and started timestamp — core CC-12 contract met.
- **Observer chrome is restrained.** Header "Observer" badge, sidebar spaces list, and "Open in log explorer" deep-link respect CLI-first mutation; logs are retrieval, not the primary live view.
- **Animated edges and dot grid** give a professional orchestration-monitor feel without graph-editor affordances (nodes not draggable per implementation).

## Issues & concerns

### Visual design

- **React Flow MiniMap and Controls render as bright white blocks** on the dark canvas — they dominate the bottom-right of the flowchart and read as broken UI, not intentional chrome. Dark-theme styling for `@xyflow/react` overlays is missing.
- **Graph layout is auto-grid, not semantic.** Nodes sit in a flat row/column index (`i % 4`) rather than a fork → lanes → join → downstream flow; dashed edges cross awkwardly and the orchestration story (parallel then plan → review) is hard to read.
- **Fixed 360px flowchart height** may clip larger graphs; no resize handle or expand-to-full-width control for complex sessions.
- **"Draft" lane shows red (failed) while session badge reads "active".** For an "active run" story, mixed lane failure without a `partial_failure` session badge creates cognitive dissonance — user cannot tell if this is healthy progress or degraded state. (See `session-failed-lane` story for the corrected badge treatment.)

### UX / usability

- **~~Right pane lacks lane detail~~** Resolved (CC-12): Lane detail card populates on run selection with step, space, and run link.
- **No visible gate tab or notification cue on-session in this story.** A session with a waiting run (`run_c1d4e5`, lifecycle "waiting") likely has a pending gate elsewhere, but this view offers no inline path to resolve it — user must discover header "Needs you" or open the `session-gate-panel-open` story.
- **Runs list omits human-readable titles.** Prototype data includes titles ("Review loop", "Daily brief") on space home but session runs show bare `run_*` IDs — harder to map lanes to work meaning.
- **Lane selection affordance could be stronger.** Border color and list highlight help, but graph node selection ring is still subtle at a glance.

### Accessibility (visible cues only)

- **Color-only lane status** (green/amber/red borders) lacks icons or text labels on nodes — problematic for color-blind users and grayscale screenshots.
- **White MiniMap/Controls** create harsh contrast jumps that may distract screen-magnifier users panning the graph area.
- **"Open in log explorer" is styled as link text** without clear button semantics in the snapshot — keyboard focus order between graph, runs, and link is unclear.

### Consistency with shell intent

- **Live flowchart + lane detail promise largely met** — graph present, lane detail on selection; gate integration shown in sibling `session-gate-panel-open` story.
- **Logs link correctly defers to `/logs`** rather than duplicating journal in-session — good separation of live vs retrieval.
- **Missing session-level metadata** common in observer tools: started time, participating spaces, flow name (`flw_orchestrator`), trigger source — all help cross-space sessions feel observable.

## Recommendations (prioritized)

1. **Theme React Flow Controls and MiniMap** for dark shell (or hide MiniMap until styled) — removes the largest visual defect in all session snapshots.
2. **~~Implement right-pane lane detail~~** — done (CC-12); consider adding journal excerpt or error one-liner when present.
3. **Align session badge with graph truth** — use `partial_failure` when any lane is red; reserve "active" for all lanes progressing or waiting without failure.
4. **Improve graph layout** — use declared graph topology (fork/join positions, lane stack) instead of index grid; consider `fitView` padding and vertical lane grouping.
5. **Add gate tab or inline banner** when the session has a pending gate tied to a listed run — keeps human action discoverable without leaving session context.
6. **Enrich runs rows** with title, relative time, and space — match space-home run card density.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 3 | Title/graph/runs clear; white overlays break polish |
| Readability | 4 | Lane detail + IDs clear; graph layout still noisy |
| Affordance / clarity | 4 | Lane selection + detail panel land; gate cue deferred |
| Dark-theme polish | 2 | MiniMap/Controls unthemed; otherwise coherent |
| Fit for orchestration UX | 4 | CC-12 lane detail complete; gate in sibling story |
| Action discoverability | 3 | Logs shortcut present; gate not inline in this story |

---

**Headline:** CC-12 lane detail lands — theme flowchart overlays and sync session badge with lane health next.
