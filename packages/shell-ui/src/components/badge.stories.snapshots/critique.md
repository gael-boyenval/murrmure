# UI/UX Critique: Badge

**Reviewed:** 2026-07-01 (updated CC-08)  
**Snapshots:** default.png, outline.png, success.png, warning.png, running.png, failed.png, gate.png

## Context & intent

Badges in Murrmure label run/session state, warnings, and completions inside dense observer UI (run lists, flowchart nodes, notification rows). They must read instantly without competing with gates or live progress.

## What works well

- **Semantic variants are legible.** Success (`Completed`) uses a restrained dark-green fill with a brighter green border; warning (`Pending`) uses amber fill, border, and text. Both communicate state at a glance without neon glow.
- **Pill shape scales for density.** Compact padding and fully rounded corners suit inline use beside timestamps, space names, or step labels.
- **Dark-theme restraint.** Colored badges sit on near-black without feeling like alert banners — aligned with observer-first, low-distraction monitoring.
- **Outline variant for neutral metadata.** Transparent fill with a thin border reads as secondary/status-adjacent (e.g. "draft", "archived") without implying success or urgency.
- **Story labels match orchestration vocabulary.** "Completed" and "Pending" are realistic session states, not generic placeholder copy.
- **CC-08 — Icon + text status variants.** `running`, `failed`, and `gate` variants pair Lucide icons (loader, alert-circle, hand) with domain copy; `warning` (Pending) uses a clock icon for passive wait.

## Issues & concerns

### Visual design

- **Default vs. background contrast is weak.** The default badge (medium-dark gray on pure black) is easy to miss in peripheral vision; it may disappear when placed on card surfaces that are only slightly lighter than black.
- **Success and warning share the same structural pattern** (filled + border + light text) but default/outline do not — fine for semantics, yet default lacks a border that would help edge definition on variable backgrounds.

### UX / usability

- **Default label "Badge" is non-semantic.** Acceptable for Storybook, but production should always use domain terms (Running, Idle, Attached) — worth documenting in stories as examples.

### Accessibility (visible cues only)

- **Success and warning text contrast looks strong** against their tinted backgrounds.
- **Outline variant relies on a thin border** for shape; on low-contrast monitors or zoomed-out views, the badge may read as floating text.
- **CC-08 addressed:** Status variants now pair color with icons and text labels, reducing reliance on hue alone.

### Consistency with shell intent

- **Tone fits observer shell.** Badges inform rather than demand action — appropriate for session/run metadata.
- **Pending vs. gate differentiated.** Amber `warning` + clock for passive wait; blue `gate` + hand for actionable human approval.

## Recommendations (prioritized)

1. ~~**Add orchestration-specific variants or story examples:** `running`, `failed`, `gate`~~ — **Done (CC-08).**
2. **Strengthen default badge edge definition** — slightly lighter fill or a hairline border so neutral labels remain scannable on card and canvas backgrounds.
3. ~~**Differentiate pending vs. gate**~~ — **Done (CC-08):** amber/clock vs blue/hand.
4. ~~**Document icon pairing in stories**~~ — **Done (CC-08).**
5. **Show badges in context snapshots** — inline beside a run title or on a flowchart node — to validate density and hierarchy.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Semantic variants pop; default is understated to a fault |
| Readability | 4 | Success/warning strong; outline and default need context |
| Affordance / clarity | 5 | Status meaning clear with icon + text (CC-08) |
| Dark-theme polish | 5 | Restrained, Vercel-like; no harsh saturation |
| Fit for orchestration UX | 4 | running/failed/gate vocabulary present; live pulse deferred to P2 |
