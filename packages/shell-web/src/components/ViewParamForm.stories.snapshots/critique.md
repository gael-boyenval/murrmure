# ViewParamForm — UI/UX Critique

**Snapshots reviewed:** `default.png`, `with-cancel.png`  
**Component role:** GateFormSchema-style fallback when `requires_view` flow has no resolvable view bundle; also the form body inside `ViewDrawer` fallback variant.

---

## Context

When `view_ref` is omitted at apply time, the shell still opens the drawer but renders schema-driven fields (topic required, depth enum). This is the **minimum viable** param collection path — functionally equivalent to gate forms, optimized for CLI-authored JSON Schema rather than bespoke view UX.

Snapshots render the bare form on a fullscreen black canvas (no drawer chrome).

---

## Strengths

1. **Schema fidelity** — Text input for `topic`, select for `depth` with enum value `quick`/`standard` reflects typed params without custom view code.
2. **Required field signal** — Asterisk on `topic` matches validation expectations.
3. **Primary action clarity** — “Start run” as solid white button is unmistakable.
4. **Cancel variant available** — `with-cancel.png` documents optional dismiss path for drawer embedding.
5. **Minimal surface** — No spurious chrome; appropriate for fallback tier.

---

## Issues

### Visual

| Issue | Detail |
|-------|--------|
| **Extreme input width** | Fields span nearly full viewport in isolated story; in drawer context this is fine, but story exaggerates horizontal stretch. |
| **Lowercase labels** | `topic`, `depth` read as raw schema keys, not human labels. |
| **Vertical spacing only** | Form floats in void with no max-width column — hurts scannability in fullscreen story. |

### UX

| Issue | Detail |
|-------|--------|
| **No field descriptions** | Schema may include `description`; none shown (contrast ReviewParamsView placeholder on Topic in drawer). |
| **Depth default unclear** | Select shows `quick` but no hint whether that is schema default or story default. |
| **No validation feedback** | Empty submit state not documented. |
| **Cancel placement** | Secondary button immediately right of primary — acceptable, but no confirmation if params were partially filled. |

### Accessibility

| Issue | Detail |
|-------|--------|
| **Labels tied to keys** | Screen readers announce “topic” not “Topic” or “Review topic”. |
| **Select native styling** | Dark theme select chevron contrast appears adequate; ensure focus ring visible on keyboard nav. |
| **Required not programmatic** | Asterisk visible; need `aria-required` / `required` attribute (not verifiable from PNG). |

### Consistency

| Issue | Detail |
|-------|--------|
| **Label case vs ReviewParamsView** | Built-in review form uses “Topic”; fallback form uses `topic` — same field, different presentation. |
| **Button label vs gate forms** | Gate resolve uses Approve/Reject; param form uses Start run/Cancel — correct semantically, but shared `GateFormSchema` renderer should unify field spacing and label styling. |
| **Default story lacks Cancel** | `default` omits Cancel while drawer fallback always shows both — story naming could mislead implementers. |

---

## Prioritized Recommendations

1. **P0 — Humanize labels** — Map schema keys to sentence case (`Topic`, `Depth`) via `title` or key formatter.
2. **P1 — Surface schema descriptions** — Muted helper text under labels; use placeholder when `description` present.
3. **P1 — Constrain story layout** — Max-width container (~480px) matching drawer content width.
4. **P1 — Add validation story** — Empty required field + inline error message snapshot.
5. **P2 — Show enum labels** | Display “Quick scan” not just `quick` if schema provides enum labels.
6. **P2 — Align default story with drawer** — Include Cancel in default or rename stories `submit-only` / `with-cancel` explicitly in docs.
7. **P3 — Optional JSON preview** — Advanced toggle showing payload that will POST (CLI-first audience).

---

## Severity Table

| ID | Issue | Category | Severity | Effort |
|----|-------|----------|----------|--------|
| P1 | Raw schema key labels | UX | **High** | Low |
| P2 | Missing field descriptions | UX | **Medium** | Low |
| P3 | Inconsistent label case vs ReviewParamsView | Consistency | **Medium** | Low |
| P4 | No validation error state | UX | **Medium** | Low |
| P5 | Full-bleed inputs in story | Visual | **Low** | Low |
| P6 | Default without Cancel | Consistency | **Low** | Low |

---

**Headline:** Functionally correct schema fallback that reads like debug UI — humanized labels and helper text would close the gap with the built-in review-params experience.
