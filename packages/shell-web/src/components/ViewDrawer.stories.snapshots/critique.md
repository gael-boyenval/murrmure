# ViewDrawer — UI/UX Critique

**Snapshots reviewed:** `review-params.png`, `fallback-form.png`  
**Component role:** Drawer shell opened before run create when flow has `start.requires_view`; hosts built-in `ReviewParamsView`, iframe view, or `ViewParamForm` fallback.

**Status (P1):** Addressed — fallback path shows amber warning callout (icon + border) above the form; subtitle stays neutral “Collect run parameters”.

---

## Context

Per views spec: user clicks **Run** → drawer opens → user submits params → `POST /v1/flows/{id}/run`. Built-in route `shell_route: murrmure/review-params` renders a tailored form; missing view bundles fall back to GateFormSchema-style fields with an explicit unavailability message.

These snapshots show the drawer in isolation (full black viewport) and the two content variants side-by-side in Storybook.

---

## Strengths

1. **Clear drawer pattern** — Right-side sheet with title, subtitle, close control, and action row matches familiar pre-flight configuration UX.
2. **Built-in variant is approachable** — “Review loop” + “Collect run parameters” frames intent; Topic placeholder (“What should this run review?”) guides input without reading docs.
3. **Fallback degradation affordance** — Amber warning callout with icon above the form when the view bundle is missing; subtitle remains “Collect run parameters” for consistent framing.
4. **Action hierarchy** — High-contrast “Start run” primary and outlined “Cancel” secondary follow shadcn conventions.
5. **Required field marking** — Asterisk on Topic communicates validation before submit.
6. **Depth as select** — Enum param rendered as dropdown (`standard`) rather than free text — appropriate for schema-driven UI.

---

## Issues

### Visual

| Issue | Detail |
|-------|--------|
| **Isolation lacks shell context** | Stories render on pure black; no dimmed page behind drawer (contrast with `space-home-run-drawer-open` prototype where backdrop scoping works well). |
| **Drawer width vs form density** | Large empty vertical space below two fields; drawer feels tall for minimal content. |
| **Label casing inconsistency** | Built-in: “Topic”, “Depth”. Fallback: “topic *” lowercase — breaks polish across variants. |

### UX

| Issue | Detail |
|-------|--------|
| **No loading / iframe state** | Spec includes `entry_url` iframe path; no snapshot for loading spinner, iframe error, or view-sdk handshake. |
| **Cancel vs close X** | Two exit paths with unclear difference (discard draft params vs dismiss?). |
| **Submit feedback absent** | No submitting/disabled state on “Start run” after click. |
| **Flow identity only in title** | Fallback title “Custom flow” is generic; flow ID or `flw_*` would help when multiple flows are runnable. |

### Accessibility

| Issue | Detail |
|-------|--------|
| **Focus trap not evidenced** | Drawer should trap focus and return on close; not verifiable from PNG but standard Sheet requirement. |
| **Close button target** | Small “×” in corner may be below 44×44px touch target. |
| **Error association** | No inline validation example (empty Topic on submit). |

### Consistency

| Issue | Detail |
|-------|--------|
| **Fallback callout styling** | Amber banner matches `GateResolvePanel` approve-consequence pattern; field styling should stay aligned with `ViewParamForm` and gate forms. |

---

## Prioritized Recommendations

1. **P0 — Unify field label typography** — Sentence case labels across built-in and fallback (`Topic`, `Depth`).
2. ~~**P1 — Elevate fallback banner**~~ — Done: warning callout above fallback form.
3. **P1 — Add Storybook states** — Loading iframe, iframe error, submitting, validation error on required Topic.
4. **P1 — Sticky footer actions** — Pin Start/Cancel to drawer bottom on short viewports.
5. **P2 — Show drawer over dimmed shell** — Default story decorator with blurred space-home backdrop (reuse page prototype pattern).
6. **P2 — Clarify exit behavior** — Tooltip or copy: “Cancel discards parameters”.
7. **P3 — Flow metadata line** — Subtitle: `flw_review_loop · review-params view`.

---

## Severity Table

| ID | Issue | Category | Severity | Effort |
|----|-------|----------|----------|--------|
| V1 | ~~Fallback message too subtle~~ | UX | **Resolved** | — |
| V2 | Label casing inconsistency | Consistency | **Medium** | Low |
| V3 | Missing iframe/loading states | UX | **Medium** | Medium |
| V4 | Generic “Custom flow” title | UX | **Medium** | Low |
| V5 | No validation/submitting states | UX | **Medium** | Low |
| V6 | Isolated black background | Visual | **Low** | Low |
| V7 | Empty vertical space | Visual | **Low** | Low |
| V8 | Close target size | a11y | **Low** | Low |

---

**Headline:** Clean pre-run drawer with elevated fallback degradation affordance; needs variant consistency (label casing) and iframe/loading story coverage to match the three view_ref paths in spec.
