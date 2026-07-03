# RunFlowchartView — UI/UX Critique

**Snapshots reviewed:** `default.png`, `selected-lane.png`  
**Component role:** Live declared step graph (`@xyflow/react`); primary “where is work now?” view on `/sessions/:id` and `/runs/:id` when `flow_id` is present.

---

## Context

Murrmure’s observer-first shell treats the flowchart as the **live flight tracker** — not a graph editor. Parallel matrix lanes should appear as fork/join nodes with lane-level status (green completed, red failed, amber in progress). Lane click should correlate to detail in the adjacent panel on session pages. When no declared graph exists, the shell falls back to `JournalWaterfallView`.

These snapshots isolate the flowchart canvas without page chrome (header, gate panels, lane detail).

---

## Strengths

1. **Status-at-a-glance borders** — Green (`Research`, `Plan`), amber (`Parallel dev`, running lanes), blue (`Review` gate), and red (`Draft`) align with spec intent for completed / in-progress / gate / failed lanes.
2. **Selected-lane affordance** — `selected-lane.png` adds a filled interior on the failed lane, making selection distinguishable from mere failure state.
3. **Fork/join topology visible** — Fork/join suffix labels on `Parallel dev` and diverging `Research` / `Draft` communicate matrix parallelism without leaving the graph.
4. **Technical aesthetic** — Dot grid and dashed edges fit a developer-observer audience and match the dark Vercel-inspired shell theme.
5. **Minimal chrome** — Canvas-first layout keeps attention on orchestration progress, consistent with philosophy (“flowchart for live; logs for retrieval”).
6. **CC-08 — Non-color status cues** — Each node shows a human title plus icon + short label (`Done`, `Running`, `Failed`, `Gate`, `Waiting`).

---

## Issues

### Visual

| Issue | Detail |
|-------|--------|
| **Minimap renders as solid white block** | Bottom-right rectangle is an unstyled or broken React Flow minimap — high-contrast glare on dark canvas. |
| **Parallel structure reads as two rows** | Bottom row (`Plan` → `Review`) appears disconnected from top row; join back to parent flow is not visually obvious. |
| **No running-state motion** | Amber borders and spinner icon convey running, but no border pulse (deferred P2). |

### UX

| Issue | Detail |
|-------|--------|
| **No legend or status key** | Color semantics are implicit; first-time observers must infer green/yellow/red meaning (legend deferred P2). |
| **Lane clickability unclear** | No cursor/hover/“selected” ring in default view; selection state only visible in the second snapshot. |
| **Zoom controls obscure** | Small white vertical control strip at bottom-left lacks labels/tooltips in snapshot. |

### Accessibility

| Issue | Detail |
|-------|--------|
| ~~**Status conveyed by color alone**~~ | **Addressed (CC-08):** icon + text label inside each node. |
| **Low contrast on dashed edges** | Grey dashed connectors may be hard to perceive for low-vision users on the dot grid. |
| **No keyboard focus indicators** | Isolated canvas gives no evidence of focus order for lane selection. |

### Consistency

| Issue | Detail |
|-------|--------|
| **Minimap issue repeats on every page** | Same white block appears on run and session page prototypes embedding this component. |

---

## Prioritized Recommendations

1. **P0 — Fix or hide minimap** until styled for dark theme (or replace with a compact overview using theme tokens).
2. ~~**P0 — Add non-color status cues** inside nodes~~ — **Done (CC-08).**
3. ~~**P1 — Differentiate fork/join nodes**~~ — **Done (CC-08):** `(fork)` / `(join)` suffixes.
4. **P1 — Show join edges** from lanes back to join node so parallel blocks read as one subgraph.
5. ~~**P1 — Enrich node content** — primary: human step name~~ — **Done (CC-08).**
6. **P2 — Active-step animation** — subtle border pulse or flowing edge on the currently executing node.
7. **P2 — Hover/selected states** — consistent ring + pointer cursor on clickable lanes; document in Storybook both default and selected stories on the same page for comparison.
8. **P3 — Optional legend** — collapsible “Status key” in canvas corner for onboarding.

---

## Severity Table

| ID | Issue | Category | Severity | Effort |
|----|-------|----------|----------|--------|
| R1 | White minimap block | Visual | **Critical** | Low |
| R2 | ~~Color-only status~~ | a11y | ~~High~~ **Resolved** | — |
| R3 | ~~Duplicate labels~~ | UX | ~~High~~ **Resolved** | — |
| R4 | Disconnected parallel rows | UX | **Medium** | Medium |
| R5 | ~~Raw step IDs on nodes~~ | UX | ~~Medium~~ **Resolved** | — |
| R6 | No active-step motion | UX | **Medium** | Medium |
| R7 | Missing legend | UX | **Low** | Low |

---

**Headline:** Human titles and icon-backed status labels inside nodes improve operator clarity; minimap styling and join-edge topology remain the main gaps.
