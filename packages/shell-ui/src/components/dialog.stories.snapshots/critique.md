# UI/UX Critique: Dialog

**Reviewed:** 2026-07-01  
**Snapshots:** default.png

## Context & intent

Dialog is the modal primitive for confirmations and focused human-in-the-loop tasks — gate approvals, destructive run actions, and short forms that must interrupt the observer shell without navigating away. The default story models a confirmation pattern: title "Confirm action", descriptive copy, Cancel (outline) + Confirm (primary) in the footer.

## What works well

- **Trigger affordance is clear.** The outline "Open dialog" button matches the established shell-ui button hierarchy — appropriate for a secondary entry point that opens a modal rather than a primary page action.
- **Story copy is orchestration-realistic.** "Confirm action" and paired Cancel/Confirm map directly to gate resolution and run lifecycle decisions.
- **Minimal chrome at rest.** A single trigger on black canvas reflects observer-first restraint — dialogs should appear only when human input is required, not as persistent UI.

## Issues & concerns

### Visual design

- **Open dialog state is captured (CC-07).** Snapshot shows overlay scrim, modal surface, title typography, description muted text, footer button alignment, and close (×) control.
- **Pure-black canvas exaggerates isolation.** In production the trigger will sit inside dense run/session UI; standalone snapshot does not validate spacing against cards or headers.

### UX / usability

- **Confirmation pattern lacks destructive semantics.** Story uses neutral "Confirm action" with a primary button — gate rejection or run cancellation may need distinct destructive styling; not demonstrated.
- **No long-content or scroll story.** Gate forms with many fields may overflow; modal scroll behavior and sticky footer are unverified.

### Accessibility (visible cues only)

- **Focus trap and initial focus cannot be evaluated** from a static snapshot alone.
- **Close control is visible** — shadcn Dialog includes an × in the corner; contrast and hit target can now be reviewed.
- **Title/description hierarchy is reviewable** in the open modal snapshot.

### Consistency with shell intent

- **Fits interrupt-only human actions** philosophically — modal confirms rather than configures.
- **Gap vs. GateResolvePanel usage.** Production gates may embed forms rather than simple confirm/cancel; story is minimal compared to real gate resolve flows.
- **No "Needs you" or gate-specific framing** — e.g. showing gate ID, space, or run context in the header.

## Recommendations (prioritized)

1. ~~**Add open-state snapshots**~~ — **Done (CC-07):** story uses `defaultOpen`; capture script waits for `[role="dialog"]` before screenshot.
2. **Add gate-context story** — header "Approve gate chk_…", body with one or two form fields, footer Approve / Reject (destructive outline).
3. **Capture overlay and backdrop** — verify scrim does not wash out underlying observer content entirely (users should retain spatial context).
4. **Document max-width and mobile behavior** — dialog on narrow viewports for notification resolve from mobile web.
5. **Add destructive confirmation variant** — "Cancel run" with red-outline or dedicated destructive primary.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Open modal captured; title/actions visible |
| Readability | 4 | Title, body, actions visible in snapshot |
| Affordance / clarity | 4 | Trigger + modal affordance reviewable |
| Dark-theme polish | 4 | Modal surface and backdrop visible on dark canvas |
| Fit for orchestration UX | 2 | Confirm pattern sketched; gate/form context missing |
