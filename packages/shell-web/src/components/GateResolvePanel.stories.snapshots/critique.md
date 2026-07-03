# UI/UX Critique — GateResolvePanel (`GateResolvePanel.stories.snapshots`)

**Status (CC-02):** Addressed — shared `GateHeader` shows title, step_id, space (§6.4 hidden-space rules), pending duration, run/session links, and blocked-work summary.

**Snapshots reviewed:** `default.png`, `submitting.png` (2)  
**Component scope:** Embedded gate resolve form on `/notifications` — default `GateFormSchema` UX per spec  
**States captured:** Idle (default) and submitting

---

## Context

`/notifications` is the **actionable inbox** where gates are primary. `GateResolvePanel` renders the default review form: optional notes + Approve/Reject mapped from hidden `decision` enum field. Spec requires embedded resolve without navigating away for simple gates.

Operators scanning the inbox need: **which gate, from which space/session, blocked how long, and what approving does.**

---

## Strengths

| Area | Observation |
|------|-------------|
| **Space context** | “Demo space” subtitle under title — minimal but useful anchor in a multi-space inbox. |
| **Form schema fidelity** | Notes field surfaced; decision enum correctly delegated to buttons (not a dropdown). Matches `GateFormSchema` default UX intent. |
| **Primary action hierarchy** | Approve remains visually dominant; Reject available but de-emphasized — sensible default for inbox throughput. |
| **Card containment** | Bordered card reads as a discrete actionable unit in a list feed — appropriate for notification rows. |
| **Submitting state exists** | Story covers disabled interaction path (buttons appear muted in submitting snapshot). |

---

## Issues by Category

### “What needs me now?” (Severity: 5)

- Panel shows **space label only** — no gate type, step name (`gate:review`), run/session link, artifact preview, or human-readable summary of the blocked task.
- In an inbox with multiple pending gates, every row would look identical except space name — ** poor scannability**.
- Title “Resolve gate” is identical across all items; does not answer *which* gate or *why*.

### Gate affordances (Severity: 3)

- Approve/Reject buttons are **obvious** and correctly placed.
- Reject is very low contrast in submitting snapshot — risk of being overlooked when operator intends to decline quickly.
- No keyboard shortcut hints or focus order visible (may exist in implementation).

### Submitting state UX (Severity: 4)

- **No explicit loading indicator** (spinner, “Submitting…”, progress on Approve button) — only disabled/muted buttons.
- Operator may click repeatedly or wonder if action registered, especially on slow hub responses.
- Both buttons disabled — correct — but no feedback on *which* decision is in flight if UX ever supports async per-button loading.

### Information density (Severity: 3)

- Horizontal sprawl: notes input spans full card width but single-line height — **low signal per pixel**.
- Missing metadata row that operators expect in inbox UIs: timestamp, run id snippet, flow name, trigger source.
- Appropriate for a **minimal embedded form** only when list item header (outside this component) carries the missing context — not shown in snapshots.

### Inbox integration (Severity: 3)

- Isolated component snapshots do not show: list ordering (FIFO vs priority), batch count header **Needs you (n)**, or navigation to full run detail for complex gates.
- No “Open in run tab” escape hatch for gates needing orchestration preview.

### Accessibility (Severity: 2)

- Notes label uses raw field name `notes` (lowercase) — works for devs, slightly informal for operators.
- Input border contrast is very subtle on dark background — may fail WCAG for some displays.

---

## Prioritized Recommendations

1. **Rich list item header (parent page concern, but panel should accept props):** gate summary line, step_id, relative time (`pending 12m`), run/session deep link.
2. **Dynamic card title:** e.g. “Review required — gate:review” or mapped friendly names from form id `review.v1`.
3. **Submitting feedback:** spinner inside Approve button + `aria-busy`; preserve Reject disabled state clearly.
4. **Inbox row density preset:** compact variant (buttons inline with title on wide screens) vs expanded (current) for mobile/narrow panes.
5. **Reject affordance:** outline with semantic destructive color on hover/focus — still secondary, but findable.
6. **Notes field:** multi-line textarea with placeholder (“Optional feedback for audit log”).
7. **Snapshot matrix:** add variants with `space_hidden` (“Private space”), long space names, and gates with extra form fields beyond notes.ts default.

---

## Severity Table

| # | Issue | State | Severity (1–5) | Rationale |
|---|-------|-------|------------------|-----------|
| 1 | Indistinguishable inbox rows (title + space only) | Default | **5** | Breaks inbox triage at scale |
| 2 | Weak submitting feedback | Submitting | **4** | Operators uncertain action landed |
| 3 | Missing run/session/step linkage | Default | **4** | Cannot verify correct gate |
| 4 | No timestamp / pending duration | Default | **3** | Priority ordering unclear |
| 5 | Reject button low visibility | Both | **3** | Secondary but must be discoverable |
| 6 | Single-line notes full-width | Default | **2** | Ergonomics for rejections |
| 7 | Raw `notes` label | Default | **2** | Polish / localization |

**Overall assessment:** Button affordances are **clear**; contextual clarity for inbox triage is **not**. The panel implements the default form correctly but, as snapshot'd, would force operators to open each run to understand blocked work — undermining the `/notifications` promise of actionable resolution in place.
