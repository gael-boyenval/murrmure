# UI/UX Critique: Input

**Reviewed:** 2026-07-01 (updated P1 resting-state)  
**Snapshots:** default.png, with-label.png, disabled.png

## Context & intent

Text inputs collect gate form values and view parameters before run create (`ViewParamForm`, `ReviewParamsView`, embedded `GateFormSchema` fields). Stories cover bare input, label pairing (email), and disabled/read-only display.

## What works well

- **Label + input pairing is clean.** "Email" label above field with `max-w-sm` constraint reads as a standard form row — appropriate density for gate resolve panels and view drawers.
- **Placeholder tone is restrained.** Muted gray placeholders ("Enter text…", "you@example.com") avoid competing with labels; fits dark-theme observer UI.
- **Disabled state reduces emphasis.** Lower-contrast text and subtle border signal non-interaction without removing the field from layout — useful for showing resolved or CLI-provided values.
- **Rounded rectangle and thin border** align with shadcn/ui shell primitives (Button, Card) for visual consistency.
- **P1 — Resting-state field definition.** `border-border` plus `bg-muted/40` lifts the control off pure black and card surfaces; field edges remain scannable in peripheral vision without competing with focus rings.

## Issues & concerns

### Visual design

- **Width inconsistency across stories.** ~~Default story spans nearly full viewport width; WithLabel is constrained (~20% width).~~ **Partially addressed (P1):** Default and Disabled now use the same `max-w-sm` wrapper as WithLabel; gate forms should still standardize width via parent containers in production.
- ~~**Border contrast is very low.** Dark gray border on pure black makes field edges hard to see in peripheral vision and on monitors with crushed blacks — especially default and disabled variants.~~
- ~~**Input fill merges with page background.** Interior appears same black as canvas; only a hairline border defines the control. Resting state lacks subtle fill differentiation (e.g. `bg-muted/30`).~~
- **No focus, error, or success states snapshotted.** Gate validation failures and keyboard focus are critical for form UX but absent from review set.

### UX / usability

- **Disabled story shows value "Read only"** — good for observer display of locked params, but placeholder arg in story is "Disabled" while snapshot shows value text; clarifies read-only vs. empty disabled.
- **No type variants shown** — password, number, textarea, or search inputs common in orchestration (token paste, port numbers, log filter).
- **Email example may mislead** — Murrmure gates more often need session IDs, branch names, approval notes; domain-specific story examples would validate label length and input width.

### Accessibility (visible cues only)

- **Label contrast is strong** (off-white on black) in with-label snapshot.
- **Field boundary improved at rest** — muted fill and `border-border` give a clearer shape before focus; keyboard users still rely on focus ring for active field.
- **Disabled text is medium gray** — readable but close to placeholder color; risk of confusing placeholder with value at a glance.
- **No visible required-field indicator** (* or "required") — gates often mark mandatory fields.

### Consistency with shell intent

- **Minimal, non-wizard form aesthetic** matches CLI-first philosophy — fields collect only what the protocol needs.
- **Missing orchestration field patterns** — monospace for IDs, copy-paste-friendly full width for grant tokens, inline helper text ("From `mrmr grant mint`").
- **No integration snapshot** with Label + description + error message stack as used in real gate forms.

## Recommendations (prioritized)

1. ~~**Strengthen resting-state field definition** — slightly lighter border or subtle background fill so inputs remain scannable on black and card surfaces.~~ — **Done (P1):** `border-border` + `bg-muted/40`.
2. ~~**Standardize width in stories** — wrap all variants in the same `max-w-sm` or `w-full` container used in gate panels.~~ — **Done (P1):** Default and Disabled wrapped in `max-w-sm`.
3. **Add snapshots for focus-visible, invalid, and read-only-with-value** states.
4. **Add orchestration-realistic stories** — "Session ID", "Approval note" (textarea), "Hub token" with monospace.
5. **Show required and helper text** beneath label — mirror `GateFormSchema` field metadata.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Label clear; resting fill defines field edges |
| Readability | 4 | Text and placeholders legible |
| Affordance / clarity | 4 | Resting shape clearer; no focus/error snapshots yet |
| Dark-theme polish | 4 | Muted fill lifts fields off black without heavy chrome |
| Fit for orchestration UX | 3 | Solid base; missing gate-specific patterns |
