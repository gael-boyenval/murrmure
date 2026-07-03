# UI/UX Critique: Space home — active

**Reviewed:** 2026-07-01 (post button Slot fix + snapshot regen)  
**Snapshot:** space-home-active.png  
**Story:** "Space home — active" (`SpaceHomePrototype` state `active`)  
**Route:** `/spaces/:id` — space with ongoing sessions, indexed flows, and recent history.

---

## Context & route intent

Active space home is the daily driver: scan running work, start flows manually, jump to sessions. Spec §12.3 orders sections as Needs attention (when present) → Active runs → Your flows → Available to run → Receiving from → Recent completed. Run on flows with `requires_view` opens `ViewDrawer` before create; preview-only flows show Preview affordance.

This snapshot shows a populated Demo space with **no Needs attention card** (steady-state operations), two active runs, three flows (two Run, one Preview), one federated **Available to run** flow, one **Receiving from** orchestrator, and one completed run. Header badge shows global pending count (3) from mock client — distinct from space-local attention, which is intentionally hidden in this story.

---

## What works well

- **Scannable section stack.** Card-per-section layout makes it easy to find runs vs flows vs history without tabs.
- **Active vs attention stories diverge.** `active` omits the Needs attention card; `attention` story shows the amber interrupt card — CC-04 fixture alignment restored.
- **Run row anatomy is clear.** Title line + mono `run_*` ID + outline lifecycle badge (`working`, `waiting`, `completed`) matches observer vocabulary.
- **Flow rows expose identity + action.** Human name, `flw_*` ID, and right-aligned Run button — primary action is obvious for manual flows.
- **Preview vs Run distinction.** Multi-agent orchestrator shows muted Preview badge when `can_run` is false — communicates grant/orchestration constraints without error text.
- **Full spec section stack (CC-11).** Available to run (federated grant) and Receiving from (cross-space orchestrator) now appear between Your flows and Recent completed.
- **Shell chrome consistent** with other pages: Observer badge, sidebar selection state, notification count.

---

## Issues

### Visual design

- **Run buttons are high-contrast white** on every runnable flow — appropriate for one primary flow, but two identical Run buttons compete equally (Review loop vs Feature spec).
- **Preview as outline Badge** next to Run buttons — inconsistent control type (badge vs button); may not read as clickable link to flow preview.
- **No relative timestamps** on runs (`started_at` available in data) — harder to prioritize "Daily brief — July 1" vs stale waiting run.

### UX / usability

- **Attention items show `hover:underline` but prototype uses `<p>` not `<Link>`.** Production links to `/sessions/:id`; snapshot suggests clickability without chevron or external-link cue (relevant in attention story).
- **Active runs not obviously navigable.** Production `RunRow` is a full-row link with hover background; prototype lacks row hover — users may not know runs open session view.
- **~~Missing Available to run and Receiving from sections.~~** Resolved (CC-11): both sections populated in active/attention stories.
- **Completed run row** shows lifecycle badge "completed" — redundant label; consider checkmark or muted styling since section title already implies completion.
- **No session grouping.** Two active runs may belong to different sessions; no `ses_*` visible though data includes `session_id`.
- **Flow name not linked to preview** when `can_preview` is true — production links flow name to `/spaces/:id/flows/:flowId`; only orchestrator shows Preview badge.

### Accessibility (visible cues only)

- **Lifecycle badges** rely on text color/outline — `waiting` vs `working` may be hard to distinguish quickly for color-only scanning (both neutral outline).
- **Run buttons** have strong label contrast; disabled/running state not shown.
- **Row click targets** for runs appear smaller than full card row if only title is perceived as interactive.

### Consistency with shell intent

- **Observer-appropriate** — Run is the main mutation; no configure UI.
- **Prototype lags production** on link behavior and extra home sections.
- **Global header count (3) vs no space attention** is correct — badge is global inbox; this space has no local blockers in the active story.

---

## Prioritized recommendations

1. **Make run rows fully clickable** with hover `bg-muted/40` and Link to session — match production `RunRow`.
2. **~~Add Available to run~~** — done (CC-11); Receiving from included when non-empty.
3. **Link flow names** to flow preview route when `can_preview`; convert Preview badge to `Button variant="outline"` or link styled consistently.
4. **Show relative time** on active/completed rows (`9m ago`, `Yesterday`).
5. **Add running/disabled state** on Run when mutation pending (per production `running` prop).

---

## Severity summary

| Area | Rating (1–5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Sections and badges well ordered |
| Readability | 4 | Titles + mono IDs clear |
| Affordance / clarity | 3 | Runs clickability weak in prototype |
| Dark-theme polish | 4 | Coherent card + button system |
| Fit for orchestration UX | 5 | Federated + receiving sections visible |
| Action discoverability | 4 | Run CTAs prominent |

---

**Headline:** Solid operational dashboard — CC-11 sections complete; strengthen row-level navigation next.
