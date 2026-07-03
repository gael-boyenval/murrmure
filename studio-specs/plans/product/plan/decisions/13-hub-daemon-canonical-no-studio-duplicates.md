# Decision 13 — Phase 07 duplicate packages audit (`hub-daemon` is canonical)

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-3.md § Open questions #4](../plan-review-3.md), [07-legacy-fdk-deletion.md](../07-legacy-fdk-deletion.md) M7  
**Blocks:** Phase 07-pre, 07d

---

## Context

[plan-review-3](../plan-review-3.md) flagged **`packages/studio-hub-daemon/` (~324 files)** as a phase 07 deletion target that appeared **missing** from `packages/`. That undermined trust in the inventory.

**Live repo audit (2026-07-03):**

| Path | State |
|------|--------|
| `packages/hub-daemon/` | **Exists** — `@murrmure/hub-daemon`, ~199 files — **canonical v2 daemon** |
| `packages/hub-core/` | **Exists** — `@murrmure/hub-core` |
| `packages/hub-persistence/` | **Exists** — `@murrmure/hub-persistence` |
| `packages/contracts/` | **Exists** — `@murrmure/contracts` |
| `packages/executors/` | **Exists** — `@murrmure/executors` |
| `packages/studio-hub-daemon/` | **Not on disk** — not in `pnpm-workspace` consumers; **already removed** from working tree |
| Other `packages/studio-*` | **Not on disk** |

Phase **07** § “Duplicate packages” still says **delete `packages/studio-hub-daemon/` entire package** — that row is **stale**. The product already consolidated on **`hub-daemon`**. Phase 07 must **delete FDK modules inside `hub-daemon`**, not delete the **`hub-daemon` package**.

### Product owner (2026-07-03)

Confirm coherence with **`hub-daemon`** naming; correct plan text accordingly.

---

## Decision

### 1. Canonical package names (normative)

| Role | Package | NPM name |
|------|---------|----------|
| HTTP daemon | `packages/hub-daemon/` | `@murrmure/hub-daemon` |
| Domain / engine | `packages/hub-core/` | `@murrmure/hub-core` |
| Murrmure persistence | `packages/hub-persistence/` | `@murrmure/hub-persistence` |
| Contracts | `packages/contracts/` | `@murrmure/contracts` |
| Executors | `packages/executors/` | `@murrmure/executors` |

**Do not delete these packages in phase 07.** Delete **FDK subsystems inside them** per [07-legacy-fdk-deletion.md](../07-legacy-fdk-deletion.md) hub daemon table.

### 2. Replace M7 “duplicate packages” milestone

**Old M7:** Delete `packages/studio-hub-daemon/` + other `studio-*` duplicates.

**New M7 (normative):**

| Step | Action |
|------|--------|
| **M7-verify** | Assert **zero** `packages/studio-*` directories and **zero** workspace imports of `@murrmure/studio-*` (grep gate) |
| **M7-done** | If verify passes, mark duplicate-package migration **complete** — no second deletion PR for phantom paths |

If a stray `studio-*` directory reappears on a branch, delete it in 07-pre — it is **legacy duplicate**, not an alternate name for `hub-daemon`.

### 3. Phase 07 inventory corrections

| Plan row | Correction |
|----------|------------|
| `packages/studio-hub-daemon/` delete ~324 files | **Remove** — already absent; replace with **M7-verify** |
| `packages/hub-daemon/src/` FDK modules | **Keep row** — delete `flow-worker-pool`, `mount-registry`, `flow-static`, etc. |
| `routes/phase07/` | **Keep** — v2 routes (plan-review critical fix) |
| `packages/studio-*` duplicates | **Verify absent**; do not conflate with `hub-daemon` rename |

### 4. plan-review-3 finding

The phantom-package finding was **valid for plan text** (inventory not verified). **Current tree** is coherent: **`hub-daemon` is the daemon**; `studio-hub-daemon` is gone. Update phase 07 and reviews to reflect this — not “delete hub-daemon,” but **“FDK excision from hub-daemon.”**

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [07-legacy-fdk-deletion.md](../07-legacy-fdk-deletion.md) | Rewrite § Duplicate packages → M7-verify; clarify hub-daemon kept |
| [07-pre](../07-legacy-fdk-deletion.md) | Add grep: no `packages/studio-*`, no `@murrmure/studio-*` imports |
| [plan-review-3.md](../plan-review-3.md) | Note superseded by decision 13 |
| CI grep gate (07g) | Include `studio-hub-daemon` path ban (must stay absent) |

---

*End of decision 13.*
