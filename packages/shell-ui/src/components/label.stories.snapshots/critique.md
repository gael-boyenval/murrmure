# UI/UX Critique: Label

**Reviewed:** 2026-07-01  
**Snapshots:** default.png

## Context & intent

Labels identify form fields in gate resolve flows and view parameter collection. They pair with Input via `htmlFor` / `id` and should establish field identity without adding visual noise in the observer shell.

## What works well

- **Typography is appropriate for form labels.** Small sans-serif, medium/semi-bold weight, off-white on black — readable without shouting over run status or journal content.
- **Restrained color.** Muted light gray avoids competing with primary actions or semantic badges — correct hierarchy for metadata labels.
- **Compact size suits dense forms.** Gate panels and view drawers stack multiple fields; label scale will not dominate vertical space.

## Issues & concerns

### Visual design

- **Isolated label lacks compositional context.** Snapshot shows "Field label" alone — no input, helper text, or spacing below. Real UX is judged in the label+control+hint stack; this snapshot under-represents the component's job.
- **Generic placeholder copy.** "Field label" is Storybook-default; does not validate longer orchestration labels ("Reference run IDs", "Notify on failure").
- **No variant for disabled or error association** — e.g. muted label when field is disabled, or red-tinted label when validation fails (if supported).

### UX / usability

- **Required vs. optional not distinguished.** Gates often need explicit required markers; none shown.
- **No description or hint line** — many gate schema fields include help text; Label story does not show pairing with `text-muted-foreground` description below.
- **Click target relationship invisible** — `htmlFor="field"` is in args but no input appears; users cannot verify label-to-field tap target from snapshot.

### Accessibility (visible cues only)

- **Label text contrast appears strong** against black background.
- **Size may be small for low-vision users** at default scale — acceptable if inputs are always paired and OS zoom is supported; not verifiable in isolation.
- **No visible association cue** (no adjacent control) — WCAG label-purpose relies on proximity; snapshot omits that relationship.

### Consistency with shell intent

- **Tone matches observer shell** — functional, no decorative chrome.
- **Should mirror gate vocabulary** in stories: "Approve", "Reject reason", "Flow parameter: branch" to stress-test wrapping and length.
- **Consistency with Input with-label story** — Input story uses its own "Email" label; Label component story is disconnected; risk of drift in font size/weight between packages if not shared.

## Recommendations (prioritized)

1. **Replace isolated snapshot with composed field row** — Label + Input + optional description in one story snapshot (or cross-reference input `with-label.png`).
2. **Add required-field story** — label with trailing asterisk or "(required)" in muted style.
3. **Add long-label story** — multi-word orchestration label wrapping to two lines.
4. **Add disabled-field label variant** — reduced opacity when associated input is disabled.
5. **Document typography tokens** — ensure Label matches gate form renderer output from `GateFormSchema`.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Appropriate secondary emphasis |
| Readability | 4 | Clear on dark background |
| Affordance / clarity | 2 | Orphan label; no field association shown |
| Dark-theme polish | 4 | Restrained, on-brand |
| Fit for orchestration UX | 3 | Fine primitive; stories too generic |
