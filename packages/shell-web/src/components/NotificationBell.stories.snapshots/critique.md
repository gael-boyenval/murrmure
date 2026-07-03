# UI/UX Critique — NotificationBell

**Snapshot reviewed:** `default.png`, `zero-pending.png`  
**Component role:** Global notifications entry point in the shell header; links to `/notifications` and surfaces pending gate/action count from `GET /v1/notifications`.  
**Product spec:** Header **Needs you (n)** badge (shell spec § Notifications & gates, phase 07).

---

## Context

The bell control is the primary affordance for actionable inbox items—especially pending gates that block agent workflows. It must be discoverable in the header, readable at a glance, and trustworthy across refresh (count persists server-side). Copy uses “Needs you” rather than generic “Notifications,” signaling human-in-the-loop urgency aligned with Murrmure’s observer/gate model.

The snapshots capture the component in isolation on a black canvas: **default** with pending count **3**, and **zero-pending** with `pending_count: 0` (no badge).

---

## Strengths

1. **Action-oriented copy** — “Needs you” communicates urgency and personal responsibility better than “Inbox” or “Alerts,” matching the gate-centric product narrative.
2. **Clear visual hierarchy** — Bell icon → label → numeric badge reads left-to-right in a single scan path; the pill outline groups the control as one tappable unit.
3. **Count visibility** — The secondary pill badge for `3` separates quantity from label without cluttering the main text; users can distinguish “something needs me” from “how many.”
4. **Consistent shell styling** — Outline `Button` + `Badge` primitives align with the shadcn/Tailwind dark theme used elsewhere.
5. **Compact footprint** — `size="sm"` keeps header density reasonable alongside ProfileMenu and space navigation.

---

## Issues

### Visual

| Issue | Detail |
|-------|--------|
| Badge contrast | The count badge uses a dark fill on a dark outline button; at small sizes the “3” may fall below comfortable contrast against adjacent header chrome. |
| Zero-state covered | `zero-pending.png` guards empty inbox UX (bell + “Needs you”, no badge). Label urgency when count is 0 remains a copy question (see UX). |
| Icon–label balance | Bell icon is subtle; on high-DPI or dim displays the icon may disappear before the text does, weakening the “notification” metaphor for icon-first scanners. |

### UX

| Issue | Detail |
|-------|--------|
| Destination unclear | The control links to `/notifications` but the label does not hint at inbox vs. settings vs. history; first-time users may not know what opens on click. |
| No loading / error affordance | While data loads or if the query fails, the button may show `0` or stale count with no skeleton or error indicator (60s refetch interval increases staleness risk). |
| Badge semantics | A raw number does not distinguish gate types (orchestration validate vs. review gate vs. run failure); users must open the inbox to prioritize. |
| “Needs you” when count is 0 | Copy remains urgent even when nothing is pending—consider softer copy or hiding the badge only (current behavior) while keeping label consistent. |

### Accessibility

| Issue | Detail |
|-------|--------|
| Focus indicator | Outline button focus ring must remain visible on dark header backgrounds (not verifiable in static PNG; worth validating in Storybook interaction tests). |

**Resolved (NB-01/02):** Link `aria-label` composes count (`Needs you, 3 pending`); visually hidden `aria-live="polite"` region announces count updates on refetch/SSE invalidation.

### Consistency

| Issue | Detail |
|-------|--------|
| Spec wording | Spec describes **Needs you (n)** inline; implementation uses a separate Badge pill. Functionally equivalent but visually diverges from parenthetical pattern used in docs. |
| Header composition | Isolated snapshot lacks context next to ProfileMenu, space switcher, and route title—spacing and alignment with sibling header items unverified. |

---

## Prioritized Recommendations

### P0 — Must fix before ship

_(None remaining — NB-01/02 shipped.)_

### P1 — Should fix soon

1. **Improve badge contrast** — Use `variant="secondary"` or a higher-contrast token on dark headers; verify WCAG AA for badge text/background pair.
2. ~~**Capture zero-state snapshot**~~ — **Done:** `ZeroPending` story + `zero-pending.png`.
3. **Loading skeleton** — Brief placeholder or opacity pulse while `notifications.list` resolves on first paint.

### P2 — Nice to have

6. **Tooltip on hover** — “Open notifications inbox” or “3 gates waiting for you.”
7. **Optional severity cue** — Dot color or icon variant when orchestration-validate gates are in the queue (requires API metadata).
8. **Align copy with spec** — Document or adopt inline `(n)` if marketing/docs expect that exact pattern.

---

## Severity Table

| ID | Finding | Severity | Effort |
|----|---------|----------|--------|
| NB-01 | Accessible name omits pending count | ~~**High**~~ **Fixed** | Low |
| NB-02 | No live announcement on count change | ~~**High**~~ **Fixed** | Low |
| NB-03 | Badge contrast on dark outline button | **Medium** | Low |
| NB-04 | No zero / loading states in design coverage | ~~**Medium**~~ **Partial** (zero-state snapshot added) | Low |
| NB-05 | Destination not hinted in label | **Low** | Low |
| NB-06 | Stale count up to 60s without visual cue | **Low** | Medium |
| NB-07 | Spec vs. Badge visual pattern mismatch | **Low** | Low |

---

## Snapshot Coverage Gaps

- Loading and error query states
- Header layout with adjacent ProfileMenu and space context
- Focus / hover / active interaction states
