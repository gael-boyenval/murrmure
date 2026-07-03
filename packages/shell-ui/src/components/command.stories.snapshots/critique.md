# UI/UX Critique: Command

**Reviewed:** 2026-07-01  
**Snapshots:** default.png  
**CC-14 addressed:** empty-state gating; multi-entity placeholder

## Context & intent

The command palette is Murrmure's power-user navigation layer — jump to flows, spaces, sessions, and runs without leaving the observer shell. Placeholder "Search flows, spaces, sessions…" and sample entities across flows, spaces, and sessions align with CLI-first users who expect ⌘K-style wayfinding.

## What works well

- **Search-first layout is correct.** Magnifying glass + input at top, results below — familiar cmdk/Linear/Vercel pattern reduces learning curve for technical users.
- **Multi-entity placeholder.** "Search flows, spaces, sessions…" signals shell-wide navigation scope; better than flows-only copy for an orchestration product.
- **Default open shows catalog, not empty state.** On first open with no query, grouped flows/spaces/sessions appear without a contradictory "No results found." message — empty copy renders only after a failed filter.
- **Realistic sample entities.** "Daily brief", "Review loop", "Feature spec", plus space and session rows match example flows in the repo and feel like navigable destinations, not lorem ipsum.
- **Dark container treatment.** Rounded rectangle, thin gray border, black interior — consistent with card/command popover styling elsewhere in shell-ui.
- **Typographic tiers.** Placeholder and empty-state copy are muted; list items are brighter — appropriate hierarchy when results are active.

## Issues & concerns

### Visual design

- **No group heading visible.** Story defines `CommandGroup heading="Flows"` (and Spaces/Sessions) but the snapshot does not show section labels — users lose categorical context (flows vs. spaces vs. sessions).
- **Flat list styling.** Items appear as plain text rows without hover/selection background in this snapshot — selected and keyboard-highlight states are unknown.
- **Low separator contrast.** Input/list divider is a dark gray hairline — fine aesthetically, easy to miss structurally.

### UX / usability

- **No keyboard hint footer** (e.g. "↵ to open", "esc to close") — common in power-user palettes and aligned with CLI-first audience.
- **No result metadata** — run cards often show space name, status, or last activity; plain titles may be ambiguous when multiple "Review loop" sessions exist.
- **Empty state not snapshotted.** "No results found." only appears after typing a zero-match query — consider a dedicated story/snapshot for that path.

### Accessibility (visible cues only)

- **Placeholder contrast looks sufficient** against black input area.
- **List item text contrast is good** for primary labels.
- **Empty message no longer conflicts with visible results** on default open — semantic improvement for screen readers.
- **Focus indicator on input and items not visible** in static snapshot.

### Consistency with shell intent

- **Strong fit for observer + power-user navigation** — complements CLI without replacing it.
- **Multi-entity catalog on open** better reflects session/run observability than a flows-only list.
- **Static snapshot hides async search** — real palette may query federation/spaces; loading and error states not reviewed.

## Recommendations (prioritized)

1. **Surface group headings** ("Flows", "Recent sessions", "Spaces") with visible muted labels and spacing.
2. **Add selection/hover snapshots** and keyboard focus ring for list items.
3. **Enrich list rows** with secondary line (space · status · time) and optional Lucide icons for entity type.
4. **Add footer with shortcuts** and optional item count — reinforces pro-tool expectations.
5. **Add NoMatches story/snapshot** to document the gated empty state after a failed query.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Input clear; default catalog reads cleanly |
| Readability | 4 | Labels legible; lacks secondary metadata |
| Affordance / clarity | 4 | Empty state no longer contradicts visible items |
| Dark-theme polish | 4 | Cohesive bordered popover on black |
| Fit for orchestration UX | 4 | Multi-entity scope; states improved |
