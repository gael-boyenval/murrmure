# Decision 12 — Skill eval (04b) is advisory, not CI

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-3.md § Open questions #3](../plan-review-3.md), [04-unified-murrmure-skill.md](../04-unified-murrmure-skill.md)  
**Blocks:** Phase 04b

---

## Context

Phase **04b** proposes skill eval fixtures with **≥5/6 keyword match** against LLM responses — inherently **non-deterministic** (model, temperature, flake). [plan-review-3](../plan-review-3.md) asked whether this runs in CI.

### Options considered

| Option | Summary | Rejected / chosen |
|--------|---------|-------------------|
| A. Advisory / manual only | Release checklist, not merge gate | **Chosen** |
| B. CI with pinned model + retries | Possible later | Deferred |
| C. Deterministic CI subset only | Partial | Optional add-on later |

**Product owner (2026-07-03):** **A**

---

## Decision

- **Skill eval (04b) is not a CI merge gate** for v2.
- Run **`packages/cli/test/skill-eval/`** (when implemented) as a **manual / release** checklist item alongside skill install smoke tests.
- Phase **04b DoD** labels eval as **`manual`** (same honesty rule as [decision 10](./10-reference-workflow-verification-layered.md)).
- **CI required for 04a/04b:** deterministic tests only — `skill-install.test.ts`, static reference file presence, router snapshot, no FDK grep in skill tree.
- Future: revisit CI eval when a **deterministic** harness exists (fixed model contract or static prompt/response fixtures).

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [04-unified-murrmure-skill.md](../04-unified-murrmure-skill.md) | 04b eval marked manual; remove implied CI gate |
| [08-docs-and-proof.md](../08-docs-and-proof.md) | Release checklist row for skill eval |

---

*End of decision 12.*
