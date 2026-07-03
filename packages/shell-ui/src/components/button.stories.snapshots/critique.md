# UI/UX Critique: Button

**Reviewed:** 2026-07-01 (updated P2 orchestration stories)  
**Snapshots:** default.png, outline.png, ghost.png, secondary.png, small.png, large.png, disabled.png, destructive.png, loading.png, gate-footer.png

## Context & intent

Buttons are the primary interaction affordance in Murrmure for resolving gates, opening run details, dismissing notifications, and confirming observer actions — always secondary to CLI workflows but must be unmistakable in a dark, information-dense shell.

## What works well

- **Primary (default) hierarchy is unmistakable.** White/light fill with black text on pure black background creates the strongest contrast in the set — appropriate for one primary action per surface (e.g. "Approve gate", "Open session").
- **Secondary variant is appropriately subdued.** Dark gray fill with light text reads as supporting action without competing with primary — good for "View logs" or "Copy session ID."
- **Outline variant balances visibility and restraint.** Thin light border, transparent fill, white label — suitable for cancel, secondary navigation, or non-destructive alternatives in card footers.
- **Size scale is coherent.** Small and large variants preserve the same primary styling with proportionate padding; small suits dense toolbars and inline card actions.
- **Disabled state reads inactive.** Reduced contrast gray-on-gray signals non-interaction; users are unlikely to treat it as clickable.
- **P2 — Destructive variant for irreversible actions.** Solid red `Cancel run` demonstrates high-stakes semantics distinct from outline Reject.
- **P2 — Loading state with spinner and aria-busy.** `Approve` loading snapshot documents async gate submission feedback.
- **P2 — GateFooter story validates sm Approve/Reject pair** with destructive-outline Reject — mirrors GateCard and GateResolvePanel spacing.

## Issues & concerns

### Visual design

- **Ghost at rest is indistinguishable from plain text.** No border, background, or padding visible in the snapshot — "Ghost" could be a label, link, or button until hover/focus (not captured). Risky in static UI and for keyboard users who haven't focused yet.
- **Primary inversion (white button) is bold but generic.** Works for shadcn/Vercel dark mode; in Murrmure, heavy use of inverted primaries across many cards may feel repetitive and "marketing site" rather than pro-tool.
- **Disabled text contrast is very low.** Label "Disabled" against medium-gray fill is faint — intentional for inactive state, but may fail WCAG for readable disabled labels (often exempt, yet hurts scanability in forms).

### UX / usability

- **Ghost for toolbar/icon-adjacent actions** needs visible hit area — snapshot suggests zero chrome; mis-clicks likely in dense headers next to notification bell or profile menu.
- **Large size may be oversized** for observer UI where most actions are inline; verify it is reserved for empty states or modals, not run lists.

### Accessibility (visible cues only)

- **Primary, outline, and destructive have strong label contrast.**
- **Ghost lacks visible focus ring in snapshot** (may exist in CSS but not shown) — critical for keyboard-first power users aligned with CLI-first philosophy.
- **Loading snapshot:** spinner present; `aria-busy` set in component — good for async gate submits.

### Consistency with shell intent

- **Hierarchy supports observer actions** — primary for gate resolution, destructive-outline for reject, outline/secondary for navigation — matches "surface human action without wizard noise."
- **Icon-only size (`icon` in argTypes) not snapshotted** — likely used in chrome; gap in visual review set.

## Recommendations (prioritized)

1. **Give ghost buttons a visible resting hit area** — subtle hover is insufficient for discovery; minimum padding and optional muted background at rest, or restrict ghost to contexts with clear affordance (table row hover).
2. ~~**Add story snapshots for destructive and loading states**~~ — **Done (P2).**
3. ~~**Add contextual story: gate footer**~~ — **Done (P2):** GateFooter at sm size.
4. **Improve disabled label readability** while keeping the control obviously inactive (e.g. lighter text on darker muted fill).
5. **Capture focus-visible states** in Storybook interaction tests or dedicated snapshots for keyboard users.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Primary/secondary/destructive clear; ghost flat |
| Readability | 4 | Strong except disabled and ghost |
| Affordance / clarity | 4 | Destructive/loading/gate footer documented |
| Dark-theme polish | 4 | Clean, consistent shadcn dark treatment |
| Fit for orchestration UX | 4 | Async/destructive/context snapshots shipped |
