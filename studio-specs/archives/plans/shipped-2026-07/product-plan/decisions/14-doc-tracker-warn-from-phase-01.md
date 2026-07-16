# Decision 14 — Doc tracker warn-only from phase 01

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-3.md § Open questions #5](../plan-review-3.md), [00-doc-skill-mcp-tracker.md](../00-doc-skill-mcp-tracker.md)  
**Blocks:** Phase 01 (optional script), 08 (strict gates)

---

## Context

[00-doc-skill-mcp-tracker.md](../00-doc-skill-mcp-tracker.md) maps each phase to docs/skill/spec files but enforcement is **manual checkboxes until phase 08** (known-gaps sync, FDK grep). Drift already exists (human vs agent `known-gaps.md`, spec §21 stale) before any phase shipped.

### Options considered

| Option | Summary | Rejected / chosen |
|--------|---------|-------------------|
| A. Wait until phase 08 only | Status quo | Too late |
| **B. Lightweight warn from phase 01** | PR script warns if code changed without tracker-listed docs | **Chosen** |
| C. Strict fail from phase 01 | Heavy for early phases | Too noisy |

**Product owner (2026-07-03):** **B**

---

## Decision

### Phase 01+ — warn-only doc drift script

Add CI or local script (e.g. `pnpm check:doc-tracker`) that:

1. Reads phase → required doc paths from [00-doc-skill-mcp-tracker.md](../00-doc-skill-mcp-tracker.md) (maintained list).
2. On PRs touching `packages/*`, `apps/*`, or `studio-specs/plans/product/plan/*` phase implementations, **warn** if no overlapping file from the tracker list changed in the same PR.
3. **Does not fail** CI in phases 01–07 (exit 0 with warning output).

Optional: comment on PR or print in CI log — implementation choice.

### Phase 08 — strict gates (unchanged + extended)

| Gate | Mode |
|------|------|
| `known-gaps.md` human/agent byte sync | **fail** CI (08-U4) |
| FDK grep in shipped paths | **fail** CI |
| VitePress link check | **fail** CI |
| Doc tracker overlap | Upgrade to **fail** optional, or keep warn |

### Immediate hygiene (not waiting for 08)

Per [decision 05](./05-triggers-only-checkpoint-steps.md) and reviews:

- Sync `known-gaps.md` B9/B10 before 03b ships.
- Fix `spec.md` §21 in same PR as phase doc updates when touching tracker rows.

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [01-apply-validation.md](../01-apply-validation.md) or root `package.json` | Add `check:doc-tracker` warn script stub |
| [08-docs-and-proof.md](../08-docs-and-proof.md) | Strict gates table; 08 upgrades tracker |
| [00-doc-skill-mcp-tracker.md](../00-doc-skill-mcp-tracker.md) | Note enforcement: warn 01–07, strict 08 |

---

*End of decision 14.*
