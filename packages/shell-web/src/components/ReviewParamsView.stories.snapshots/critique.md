# UI/UX Critique — ReviewParamsView

**Snapshots reviewed:** `default.png`, `with-cancel.png`  
**Component role:** Built-in shell route `murrmure/review-params`; pre-run parameter form shown inside **ViewDrawer** when a flow declares `start.requires_view: review-params`.  
**Product spec:** Custom views phase 11; see `views.md` run flow (drawer → submit → `POST /v1/flows/{id}/run`).

---

## Context

This view collects operator input before a review-loop (or similar) run starts: **Topic** (required text) and **Depth** (enum: quick / standard / deep). Submitting calls `onSubmit({ topic, depth })`; optional `onCancel` closes the drawer without creating a run.

Isolated snapshots render the bare form on a full-width black canvas. In product context, the same form appears inside ViewDrawer with title **“Review loop”** and subtitle **“Collect run parameters”** (see `ViewDrawer.stories.snapshots/review-params.png`).

---

## Strengths

1. **Focused field set** — Two fields keep cognitive load low for a pre-run gate; appropriate for a built-in demo/review flow.
2. **Strong primary CTA** — “Start run” solid button clearly signals forward action; disabled when `submitting` (not shown in snapshots).
3. **Helpful placeholder** — “What should this run review?” orients users on Topic intent better than an empty input.
4. **Required field marked** — `Topic *` communicates validation before submit attempt.
5. **Cancel variant** — `with-cancel.png` shows outline Cancel beside primary, matching ViewDrawer dismissal pattern and avoiding trap focus in modal drawer.
6. **Label + Input primitives** — Topic field uses `@murrmure/shell-ui` `Label` and `Input` consistently with GateResolvePanel and ViewParamForm fallback.

---

## Issues

### Visual

| Issue | Detail |
|-------|--------|
| Full-width stretch | Snapshots use wide Storybook canvas; inputs span entire width, making the form feel like a settings page rather than a drawer panel (~400px). |
| Depth uses native `<select>` | Border/radius approximates `Input` but chevron and option list use OS styling—breaks parity with Topic field. |
| Option capitalization | Values displayed as lowercase `standard`, `quick`, `deep`; labels elsewhere use Title Case (`Topic`, `Depth`). |
| Sparse vertical rhythm | Only two fields + button; large empty regions above/below in isolated snapshots (mitigated when embedded in ViewDrawer). |
| Cancel visual weight | Outline Cancel competes evenly with primary in `with-cancel`; acceptable in drawer context but button order (Start left, Cancel right) matches Western primary-left pattern—verify against shell button order conventions. |

### UX

| Issue | Detail |
|-------|--------|
| Missing drawer chrome in snapshots | Without title/subtitle/close (X), isolated stories underrepresent real UX; reviewers may critique layout incorrectly. |
| Depth semantics unexplained | No helper text describing what quick vs. deep changes (cost, thoroughness, model behavior). |
| No inline validation copy | Relies on native `required` for Topic; empty submit may show browser default tooltip rather than branded error. |
| Submitting state not snapshotted | Users cannot see loading/disabled feedback during run creation latency. |
| Cancel without confirmation | Discarding filled Topic may lose user input silently—acceptable for short form but worth noting for longer variants. |
| Flow name absent in isolated view | ViewDrawer supplies “Review loop”; bare form does not indicate which flow will run. |

### Accessibility

| Issue | Detail |
|-------|--------|
| Depth select labeling | Has `id="depth"` + `<Label htmlFor="depth">` — good; native select accessibility varies by platform in dark theme. |
| Required Topic | Visual asterisk present; ensure `aria-required="true"` on input (likely via `required` attribute). |
| Error announcements | No `aria-invalid` / `aria-describedby` hook for validation messages. |
| Cancel button | `type="button"` prevents accidental submit — good; should move focus back to trigger on drawer close (ViewDrawer responsibility). |

### Consistency

| Issue | Detail |
|-------|--------|
| vs. ViewParamForm fallback | GateFormSchema fallback uses same Button/Label/Input patterns; Depth enum should mirror Select styling used in generated fallback forms. |
| vs. ViewDrawer embedding | Drawer adds header, close control, and cancel; **default** snapshot omits cancel though ViewDrawer likely always passes `onCancel`. |
| Built-in route contract | Form fields are hardcoded, not driven by `schemas/params.json`; acceptable for built-in route but document divergence from custom view manifests. |

---

## Prioritized Recommendations

### P0 — Must fix before ship

1. **Use shell-ui Select for Depth** — Match Topic input styling and dark-theme option list.
2. **Snapshot in ViewDrawer context** — Primary visual regression target should be drawer-embedded (already exists separately; cross-reference in Storybook docs).

### P1 — Should fix soon

3. **Constrain form max-width** — e.g. `max-w-md` inside drawer content so fields do not stretch on ultrawide layouts.
4. **Depth helper text** — One line under select: “Controls review thoroughness and runtime.”
5. **Branded validation** — On submit with empty Topic, inline error under field instead of browser-native constraint UI.
6. **Title Case depth options** — Quick / Standard / Deep in UI; map to lowercase values on submit.
7. **Submitting snapshot** — Story with `submitting: true` for button disabled + loading indicator.

### P2 — Nice to have

8. **Field descriptions from manifest** — Long term: hydrate labels/help from view `params.json` even for built-in route.
9. **Keyboard shortcut hint** — Cmd+Enter to submit in drawer footer.
10. **Default snapshot should include Cancel** — Align default story with ViewDrawer behavior (`onCancel` always provided).

---

## Severity Table

| ID | Finding | Severity | Effort |
|----|---------|----------|--------|
| RPV-01 | Native select breaks field styling parity | **Medium** | Low |
| RPV-02 | Full-width layout in wide contexts | **Medium** | Low |
| RPV-03 | Depth options lack semantic helper text | **Medium** | Low |
| RPV-04 | Isolated snapshots omit drawer chrome | **Low** | Low |
| RPV-05 | Lowercase depth display values | **Low** | Low |
| RPV-06 | No submitting-state visual coverage | **Low** | Low |
| RPV-07 | Validation UX relies on browser defaults | **Low** | Medium |
| RPV-08 | Default story omits Cancel vs. production drawer | **Low** | Low |

---

## Snapshot Coverage Gaps

- `submitting: true` (disabled Start run)
- Validation error on empty Topic submit
- ViewDrawer-embedded layout (exists in sibling directory; not in this folder)
- Focus state and keyboard navigation within drawer
- Long Topic text / multiline variant if supported by flow schema
