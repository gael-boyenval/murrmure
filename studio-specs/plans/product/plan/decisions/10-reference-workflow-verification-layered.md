# Decision 10 — Reference workflow verification (R1–R6 layered)

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-3.md § Reference workflow R1–R6](../plan-review-3.md), [10-reference-workflow-preview-review.md](../10-reference-workflow-preview-review.md)  
**Related:** [Decision 04](./04-human-checkpoint-resolve-wire.md), [Decision 05](./05-triggers-only-checkpoint-steps.md), [08-docs-and-proof.md](../08-docs-and-proof.md)  
**Blocks:** Phase 02, 06, 08

---

## Context

[10-reference-workflow-preview-review.md](../10-reference-workflow-preview-review.md) defines acceptance criteria **R1–R6** for the preview-review loop. [plan-review-3](../plan-review-3.md) found:

- **R1, R5, R6** — automatable (apply strict, engine fixtures, grep).
- **R2–R5 (UI half)** — only manual Desktop tutorial walkthroughs specified; no CI strategy.

Phase 06 is the north-star centerpiece (ViewCanvasHost). Claiming “done” without any automated guard for primary-region hosting would overstate confidence.

### Options considered

| Option | Summary | Rejected / chosen |
|--------|---------|-------------------|
| A. Manual only | 08-T1 human walkthrough | Insufficient honesty for CI |
| B. Component tests only | Shell + engine fixtures | Good minimum but incomplete for R2/R3 |
| C. Playwright Desktop E2E | Full R2–R5 in CI | Heavy for v2 MVP |
| **D. Layered** | CI minimum + manual release + E2E backlog | **Chosen** |

**Product owner (2026-07-03):** **D**

---

## Decision

### R1–R6 traceability matrix (normative)

| ID | Criterion | CI required (phase 08) | Manual release proof | Backlog |
|----|-----------|------------------------|----------------------|---------|
| **R1** | Example tree `apply --strict` | ✅ CLI/hub fixture | — | — |
| **R2** | Non-contributor scaffold/clone → Run Desktop | — | ✅ **08-T1** walkthrough | Playwright Desktop |
| **R3** | Preview in ViewCanvasHost (not drawer/form) | ✅ **shell-web component test** (primary region width / no Sheet default) | ✅ 08-T1 visual confirm | Playwright screenshot |
| **R4** | Request changes → build reruns → round 2 preview | ✅ **hub-core fixture** (`gate-loop-on-resolve` + step output chain) | ✅ 08-T1 round-trip | Playwright + view reload |
| **R5** | Approve → terminal completed | ✅ **hub-core fixture** (declarative gate chain) | ✅ 08-T1 | — |
| **R6** | Zero FDK commands in workflow | ✅ grep CI gate (phase 08) | — | — |

**Honesty rule:** Phase 08 DoD must **label** each R row as `CI` | `manual` | `backlog` — no row marked CI unless a named test file exists.

### CI layer (required before v2 “done”)

1. **Engine fixtures** (`packages/hub-core/test/`, `studio-specs/current/fixtures/flow-engine/`):
   - Checkpoint resolve → `on_resolve` branch ([decision 06](./06-checkpoint-on-resolve-explicit.md))
   - Two-round loop without imperative gate scripts
   - Covers **R4 engine half**, **R5**

2. **Shell component test** (`packages/shell-web/`):
   - Pending checkpoint with `view_ref` → **ViewCanvasHost** occupies primary content region (not `ViewDrawer` max-width)
   - Covers **R3 minimum** (layout contract, not pixel-perfect preview)

3. **Apply / example tree**:
   - `examples/flows/preview-review-v2/` passes `mrmr space apply --strict`
   - Covers **R1**, contributes to **R6**

4. **FDK grep gate** (phase 08):
   - Covers **R6**

### Manual release layer (required, not CI)

- **08-T1** (and **08-T1b** agent-owned loop per [decision 04](./04-human-checkpoint-resolve-wire.md)): human executes on Desktop each release until Playwright lands.
- Document in [08-docs-and-proof.md](../08-docs-and-proof.md) as **release checklist**, not `pnpm test`.

### Backlog (explicit non-blocker for v2 ship)

- **Playwright** (or equivalent) against shell dev URL or bundled Desktop for **R2 full path** and **R3/R4 visual** round-trip.
- Track in phase 08 or post-v2 issue; do not mark R2/R3/R4 as CI-green until implemented.

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [08-docs-and-proof.md](../08-docs-and-proof.md) | R matrix with CI/manual/backlog columns; 08-T1 manual labeled |
| [10-reference-workflow](../10-reference-workflow-preview-review.md) | § Acceptance — link to this decision |
| [02-engine-completion.md](../02-engine-completion.md) | Fixtures explicitly map to R4/R5 |
| [06-gate-requires-view.md](../06-gate-requires-view.md) | Shell test maps to R3 |
| [plan-review-3.md](../plan-review-3.md) | Close verification gap with decision reference |

---

*End of decision 10.*
