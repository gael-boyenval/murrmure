# UI/UX Critique — ProfileMenu

**Snapshot reviewed:** `default.png`  
**Component role:** Header-adjacent user preferences: default landing space (`PATCH /v1/me` `landing_space_id`), email/desktop notification opt-out toggles (`notify_email`, `notify_desktop`), plus quick link to `/logs`.  
**Product spec:** Profile menu sets landing space; phase 15 adds per-channel notification toggles (shell spec § Notifications & gates, Out-of-shell).

---

## Context

Despite the name “ProfileMenu,” the implementation presents as a horizontal **utility strip** rather than a dropdown profile surface. Operators use it to choose which space loads on `/` redirect and whether out-of-shell email/desktop pushes fire for `mrmr.gate.pending` and `mrmr.run.failed` events.

The snapshot shows: checked **Email** and **Desktop** checkboxes, a **Demo space** native `<select>`, and a **Logs** ghost button—all on a black background.

---

## Strengths

1. **Immediate persistence model** — Checkbox and select changes PATCH on interaction; no extra Save step fits power-user header ergonomics.
2. **Sensible defaults reflected** — Both notification channels checked matches spec default (`notify_*` default on, opt-out semantics).
3. **Landing space visible** — Exposing default space in the header makes redirect behavior legible without diving into settings.
4. **Logs discoverability** — Journal explorer is one click away for operators debugging runs/gates.
5. **Compact horizontal layout** — Fits narrow header bands when space names are short.

---

## Issues

### Visual

| Issue | Detail |
|-------|--------|
| Native checkbox styling | Bright blue OS checkboxes clash with Murrmure’s monochromatic shadcn dark theme—most jarring inconsistency in the header cluster. |
| Native `<select>` styling | Landing space dropdown uses custom border classes but retains platform select chrome; mismatches NotificationBell outline button and ReviewParamsView `Input`. |
| No profile identity | No avatar, email, or display name—component name promises “menu” but UI reads as anonymous prefs toolbar. |
| Visual grouping absent | Email/Desktop/space/logs sit in one undifferentiated row; no separators, headings, or popover container. |
| Label size | `text-xs text-muted-foreground` labels may be hard to read on varied monitors, especially next to bolder header elements. |

### UX

| Issue | Detail |
|-------|--------|
| Misleading component name | Users expect avatar → dropdown (account, sign out, prefs); flat inline controls surprise and scale poorly. |
| Notification toggles lack context | “Email” / “Desktop” without “Notify me when…” leave scope ambiguous (all events? gates only? per spec: gate.pending + run.failed only). |
| No save feedback | Instant PATCH with no toast/checkmark; failures may go unnoticed. |
| Logs placement | Mixing navigation (`Logs`) with account prefs conflates two mental models; logs might belong in primary nav or command palette. |
| Empty spaces state | When `spaces.length === 0`, landing selector disappears silently—no empty guidance (“Create a space via CLI”). |
| Horizontal overflow risk | Long space names + four controls may wrap awkwardly or truncate on smaller viewports / bundled desktop window. |

### Accessibility

| Issue | Detail |
|-------|--------|
| Checkbox hit targets | Labels wrap small native inputs; touch targets may be below 44×44px on desktop touch devices. |
| Select accessible name | Native select lacks explicit `<label>` association; relies on implicit option text. |
| No menu semantics | Not a `menu` or `dialog`—good for simplicity, but name “ProfileMenu” implies `aria-haspopup` patterns that do not exist. |
| Logs link | Uses `<a href="/logs">` inside ghost Button—verify single focusable target and descriptive name (“Open journal logs”). |

### Consistency

| Issue | Detail |
|-------|--------|
| Design system bypass | Raw `<input type="checkbox">` and `<select>` instead of `@murrmure/shell-ui` Checkbox / Select components used elsewhere. |
| vs. NotificationBell | Bell uses shadcn Button/Badge; ProfileMenu looks like unstyled HTML dropped into the same header. |
| vs. ViewDrawer forms | ReviewParamsView uses `Label` + `Input`; profile prefs should share the same field primitives. |

---

## Prioritized Recommendations

### P0 — Must fix before ship

1. **Replace native controls with shell-ui primitives** — Checkbox and Select (or Combobox) for theme-consistent, accessible styling.
2. **Clarify notification scope** — Helper text or tooltips: “Email/desktop alerts for gates and failed runs.”

### P1 — Should fix soon

3. **Popover or dropdown profile menu** — Trigger: avatar or user initials; sections: **Notifications**, **Default space**, links (Logs, Connect). Matches name and scales on small screens.
4. **Show user identity** — Display email or hub username from `GET /v1/me` in menu header.
5. **Mutation feedback** — Inline spinner on control or subtle toast on PATCH success/failure.
6. **Associated labels** — `<Label htmlFor=…>` for each control; group with `<fieldset>` + `<legend>Notifications</legend>`.

### P2 — Nice to have

7. **Separate Logs from profile** — Move to sidebar or header nav item if logs are global, not personal.
8. **Empty-state copy** — When no spaces, show disabled select + CLI hint from `/spaces/new`.
9. **Desktop-only toggle visibility** — Hide Desktop checkbox on web-only hosted shell if desktop push is N/A.

---

## Severity Table

| ID | Finding | Severity | Effort |
|----|---------|----------|--------|
| PM-01 | Native checkboxes break design system | **High** | Medium |
| PM-02 | “ProfileMenu” UX mismatch (no menu / identity) | **High** | Medium |
| PM-03 | Notification toggle scope unexplained | **Medium** | Low |
| PM-04 | Native select inconsistent with shell inputs | **Medium** | Low |
| PM-05 | No PATCH success/error feedback | **Medium** | Low |
| PM-06 | Header overflow / wrap on narrow widths | **Medium** | Medium |
| PM-07 | Logs mixed with account prefs | **Low** | Low |
| PM-08 | Touch target size on checkboxes | **Low** | Low |

---

## Snapshot Coverage Gaps

- Popover/dropdown open state (if redesigned)
- Unchecked notification toggles (opt-out state)
- Empty spaces list
- Loading `me` / `spaces` queries
- Error state on failed PATCH
- Hosted vs. bundled desktop (desktop notify toggle visibility)
