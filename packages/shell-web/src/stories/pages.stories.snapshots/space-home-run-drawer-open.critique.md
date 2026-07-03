# UI/UX Critique: Space home — run drawer open

**Reviewed:** 2026-07-01  
**Snapshot:** space-home-run-drawer-open.png  
**Story:** "Space home — run drawer open" (`SpaceHomeWithDrawerPrototype`)  
**Route:** `/spaces/:id` with `ViewDrawer` open after Run on a flow with `start.requires_view` / `view_ref`.

---

## Context & route intent

Per shell spec phase 11: clicking **Run** on a flow with a required view opens `ViewDrawer` before `POST /v1/flows/{id}/run`. Built-in `shell_route: murrmure/review-params` renders Topic + Depth fields; submit creates run and navigates to session. Cancel/close dismisses without side effects.

This snapshot shows Review loop drawer over a dimmed space home — partial page visible (Your flows, Active runs) with form fields and Start run / Cancel actions.

---

## What works well

- **Backdrop dimming scopes focus.** Main content recedes; drawer is clearly modal layer — best-in-class among ViewDrawer component stories (which render on pure black).
- **Drawer title matches flow name.** "Review loop" + subtitle "Collect run parameters" frames pre-flight intent.
- **Form is minimal and purposeful.** Topic (required) + Depth select — appropriate for review-params view without wizard chrome.
- **Action hierarchy correct.** White "Start run" primary, outlined "Cancel" secondary, X close in header.
- **Run origin visible behind drawer.** User can see they triggered Run from Review loop row (`flw_review_loop`) — maintains context.
- **Observer shell remains** — sidebar and header still visible; user is not ejected to a full-page form.

---

## Issues

### Visual design

- **Drawer consumes ~⅓ width with sparse form.** Large empty vertical area below two fields (noted in ViewDrawer critique) — feels tall for little content.
- **Main content truncation.** Only Your flows (one row) and partial Active runs visible — dimmed state may obscure whether other sections exist.
- **Section order differs from default home.** Your flows appears above Active runs here (prototype simplification) vs standard Active → Your flows ordering — subtle inconsistency when drawer closes.
- **Active run row simplified** — no lifecycle badge or `run_*` ID in background; weaker continuity with other space-home snapshots.

### UX / usability

- **No submitting state** on Start run after click — production passes `submitting={runMutation.isPending}`; story should show disabled button + spinner.
- **Cancel vs X close** — ambiguous whether both discard params (ViewDrawer critique applies).
- **No validation example** — empty Topic on submit should show inline error; not evidenced.
- **Drawer blocks attention items** — if Needs attention were present, drawer would hide blockers; acceptable for Run flow but worth testing z-index when gate pending on same space.
- **Post-submit navigation not shown** — success should land on `/sessions/:id`; story ends at pre-submit.
- **Only one flow in background** — doesn't demonstrate choosing among multiple Run targets before drawer opens.

### Accessibility (visible cues only)

- **Focus trap** assumed for Sheet but not verifiable from PNG.
- **Close X target** appears small — may be below 44×44px touch minimum.
- **Required Topic asterisk** visible — good; error state not shown.
- **Backdrop contrast** — dimming level appears sufficient to separate layers.

### Consistency with shell intent

- **Correct pre-run pattern** — view before invoke, not inline on home card.
- **Aligns with review-params built-in view** — matches `view_ref` on `flw_review_loop` demo data.
- **Missing iframe/fallback variants** on page-level story — component stories cover fallback; page story only shows happy path.
- **Profile/notifications still interactive?** Unclear if backdrop blocks header clicks — should block only main, or entire shell below drawer.

---

## Prioritized recommendations

1. **P0 — Add submitting snapshot** — Start run disabled with loading label during `runMutation`.
2. **P1 — Match production section order** behind drawer (Active runs before Your flows) for continuity when drawer closes.
3. **P1 — Sticky footer actions** in drawer for short viewports — pin Start/Cancel to bottom.
4. **P1 — Validation error state** — empty Topic submit shows field error + aria association.
5. **P1 — Post-run story frame** — optional second snapshot after submit showing navigation toast or session redirect.
6. **P2 — Subtitle metadata** — `flw_review_loop · review-params` under title for power users.
7. **P2 — Clarify exit copy** — "Cancel discards parameters" helper text or tooltip.
8. **P2 — Page story for fallback view** — drawer over home when view bundle missing (warning banner).

---

## Severity summary

| Area | Rating (1–5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Drawer clearly dominant |
| Readability | 4 | Labels and placeholders clear |
| Affordance / clarity | 3 | Missing submit/validation states |
| Dark-theme polish | 4 | Backdrop + sheet cohesive |
| Fit for orchestration UX | 4 | Correct requires_view gate |
| In-context presentation | 5 | Best drawer-in-shell reference |

---

**Headline:** Strong in-context pre-run drawer with proper backdrop — add submitting/validation states and align background home layout with standard space-home snapshots.
