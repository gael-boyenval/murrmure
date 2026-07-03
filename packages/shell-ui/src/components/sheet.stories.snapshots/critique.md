# UI/UX Critique: Sheet

**Reviewed:** 2026-07-01  
**Snapshots:** right.png, left.png

## Context & intent

Sheet is the slide-over panel primitive — the pattern behind `ViewDrawer` (view params before run create), notification resolve side panels, and optional navigation drawers. Stories cover right-side ("Side panel") and left-side ("Navigation") entry points with title + muted body copy.

## What works well

- **Trigger buttons match dialog pattern.** Outline variants ("Open sheet", "Open left sheet") use the same secondary affordance as Dialog — consistent entry for non-persistent surfaces.
- **Left/right stories document side prop.** Explicit coverage of both edges supports layout decisions (e.g. view params from right, nav from left).
- **Story titles are domain-oriented.** "Side panel" vs. "Navigation" hint at real shell roles rather than generic "Sheet content."
- **Observer-first at rest.** Empty black canvas with a single trigger reflects that sheets overlay observer content rather than replacing it.

## Issues & concerns

### Visual design

- **Open panel state is captured (CC-07).** Snapshots show panel width, border/shadow, header typography, content padding, backdrop scrim, and close control for both right and left variants.
- **No width variant shown.** ViewDrawer may need wider sheets for iframe views or forms; default `sm:max-w-sm` vs. custom width unverified.

### UX / usability

- **Right sheet story maps to ViewDrawer** — production use includes form footers (Run / Cancel), iframe embed, and scrollable param lists; story shows only a single paragraph.
- **Left "Navigation" story is under-specified.** Murrmure v2 retires configure nav; left sheet may be rare — story should either reflect actual routes (session lane detail?) or defer to right-primary pattern.
- **Dismiss affordance visible.** Close button shown in open-state snapshots; swipe and overlay click not assessable from PNG.
- ~~**Static snapshot pipeline** does not open the sheet before screenshot~~ — **Fixed (CC-07):** stories use `defaultOpen`; capture script waits for `[role="dialog"]`.

### Accessibility (visible cues only)

- **Focus management into panel unreviewable** from closed state.
- **Title "Side panel" / "Navigation" hierarchy** — heading level and close control placement not shown.
- **Scroll trap and background inertness** — critical for overlay panels; not assessable.

### Consistency with shell intent

- **Slide-over fits observer shell** — keeps run flowchart or journal visible under scrim while collecting view params or resolving gates inline.
- **Missing ViewDrawer-like story** — title "Start run", form fields, primary "Run" footer would validate orchestration UX.
- **Notification resolve panel** may reuse Sheet; no story tying sheet to `/notifications` resolve flow.

## Recommendations (prioritized)

1. ~~**Add open-state snapshots for Right and Left**~~ — **Done (CC-07):** `defaultOpen` on stories; capture script overlay prep.
2. **Add ViewDrawer story** — sheet with param form, sticky footer (Cancel / Run), muted description of flow.
3. **Show backdrop scrim opacity** — ensure underlying session/run context remains faintly visible (spatial anchoring for observers).
4. **Capture wide sheet variant** for iframe `entry_url` views.
5. **Deprecate or repurpose left sheet story** if shell is right-drawer-primary; avoid documenting unused patterns.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Panel chrome visible in open snapshots |
| Readability | 4 | Content area visible |
| Affordance / clarity | 4 | Triggers and panel entry reviewable |
| Dark-theme polish | 4 | Panel surface and backdrop visible |
| Fit for orchestration UX | 2 | ViewDrawer/gate patterns not demonstrated |
