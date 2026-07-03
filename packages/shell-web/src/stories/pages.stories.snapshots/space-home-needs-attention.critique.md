# UI/UX Critique: Space home — needs attention

**Reviewed:** 2026-07-01 (post button Slot fix + snapshot regen)  
**Snapshot:** space-home-needs-attention.png  
**Story:** "Space home — needs attention" (`SpaceHomePrototype` state `attention`)  
**Route:** `/spaces/:id` — space with pending gates and/or failed runs requiring user action.

---

## Context & route intent

The Needs your attention section surfaces space-scoped gates and failures — the local counterpart to the global **Needs you (n)** header badge and `/notifications` inbox. Items should route to session/run views (gate tab auto-focus per spec §12.4). Philosophy: observer shell shows state; resolution happens in gate panels, not inline wizards on home.

This snapshot shows two attention items (human approval gate, orchestrator failure) in an **amber-accent card** above the full active stack (runs, flows, available, receiving, recent). The card is visually distinct from the neutral "active" story (CC-04 fix). Kind badges differentiate gate ("Approval needed" / warning) vs failure ("Failed" / outline).

---

## What works well

- **Attention section placement at top.** Correct priority — blockers appear before active runs and runnable flows.
- **Amber interrupt styling.** Border tint, amber title, and tinted card background elevate the section vs neutral list cards — addresses prior CC-04 / CC-11 gap.
- **Kind differentiation via badges.** Gate vs `run_failed` items no longer look identical — warning vs outline variants communicate severity.
- **Copy is human-readable.** "Review loop — human approval needed" and "Orchestrator run failed at plan step" describe outcome, not raw `gate_*` IDs.
- **Coexistence with Active runs is realistic.** Waiting review run (`run_c1d4e5`) parallels gate item — shows live work blocked on user input.
- **Global notification count (3) visible** in header — aligns attention block with inbox mental model (third item may live in Ops space).
- **No inline gate forms on home** — preserves separation: home lists, `/sessions/:id` or notifications resolve.
- **Full section stack below interrupt.** Available to run and Receiving from visible under attention card — CC-11 complete alongside amber interrupt (CC-04).

---

## Issues

### Visual design

- **Card title "Needs your attention"** vs header "Needs you" — slight wording mismatch may reduce connective tissue between badge and section.
- **Attention items lack CTAs.** No "Resolve", "Review", or chevron — only underlined-on-hover text in production links; snapshot shows static paragraphs.
- **Failure badge uses outline variant** — less urgent than gate warning; acceptable but could use destructive tint for failed runs.

### UX / usability

- **Count mismatch risk.** Header shows 3 notifications; space attention lists 2 — third may be in Ops space (`gate_orch_01` in demo data). Without explanation, users may hunt for a missing third item on this page.
- **No deep link hint.** Items should land on `/sessions/:id` with gate tab or `/runs/:id?gate=chk_*` — destination not previewable from list row.
- **Failure item title only** — no Retry affordance on home (spec puts Retry on run detail); acceptable, but "failed" severity could link to failed run directly.
- **Duplicate information.** Gate title references Review loop; same run appears in Active runs as "waiting" — useful correlation but no visual link between rows.

### Accessibility (visible cues only)

- **Amber card improves urgency** vs position-only — still no `role="alert"` or aria-live equivalent visible.
- **Underline-on-hover** is easy to miss for keyboard/touch users if not focused styled.
- **Notification bell badge** remains more prominent than individual attention lines — acceptable given global vs local scope.

### Consistency with shell intent

- **Correct responsibility boundary** — list, don't resolve on home.
- **Underpowered vs notifications page** — inbox items include summary text and resolve actions; home attention rows are thinner.
- **Echoes GatePanel amber language** from component stories — home card now aligns with gate interrupt vocabulary.

---

## Prioritized recommendations

1. **P1 — Make rows proper links** with chevron, full-row hit target, and `hover:bg-muted/40` matching `RunRow`.
2. **P1 — Unify copy** — section title "Needs you" to match header, or header "Needs your attention."
3. **P1 — Show space-local count** in section header (already shows "(2)") and clarify global (3) includes other spaces via tooltip on header badge.
4. **P1 — Correlate rows** — gate item could show `run_c1d4e5` mono ID or "Same session as Active run below."
5. **P2 — Expiry countdown** when `expires_at` present (spec §12.6).
6. **P2 — Stronger failure badge** — destructive outline or icon for `run_failed` kind.

---

## Severity summary

| Area | Rating (1–5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Amber card elevates attention vs other sections |
| Readability | 4 | Clear natural-language titles + kind badges |
| Affordance / clarity | 3 | Click/resolve cues still weak |
| Dark-theme polish | 4 | Consistent shell styling |
| Fit for orchestration UX | 5 | Attention + federated sections complete |
| Urgency / interrupt UX | 4 | Amber treatment + kind badges land well |

---

**Headline:** Attention block reads as an interrupt with full home sections — next up: row links and header/section copy alignment.
