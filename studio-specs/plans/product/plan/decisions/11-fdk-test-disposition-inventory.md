# Decision 11 — Phase 07 FDK test disposition inventory

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-3.md § Open questions #2](../plan-review-3.md), [07-legacy-fdk-deletion.md](../07-legacy-fdk-deletion.md) M3  
**Blocks:** Phase 07-pre, 07

---

## Context

Phase **07** deletes the FDK worker runtime and many hub-daemon tests that cover mount/bundle/install paths. **07-pre M3** says “port or delete 17+ hub-daemon tests” without a **per-test disposition**. [plan-review-3](../plan-review-3.md) flagged:

- Risk of silently dropping **security** coverage (mount collision, worker-env sanitization).
- No PR gate ensuring replacements exist before deletion merges.

### Options considered

| Option | Summary | Rejected / chosen |
|--------|---------|-------------------|
| A. Ad hoc at execution | Decide during 07 | Too risky |
| B. Explicit inventory | Table per test | Good but insufficient for security |
| **C. B + security rule** | Inventory required; security rows need port or rationale | **Chosen** |

**Product owner (2026-07-03):** **C**

---

## Decision

### 1. Required artifact before phase 07 merge

Create and maintain:

**`studio-specs/plans/product/plan/07-fdk-test-disposition.md`**

(or section in **07-pre** — same content, single source)

Table columns:

| Test file / case | Covers (FDK surface) | Disposition | v2 replacement (path) or drop rationale |
|------------------|----------------------|-------------|----------------------------------------|

**Disposition values:**

- **`delete`** — FDK-only; no v2 equivalent needed
- **`port`** — v2 test exists or lands in same PR (path required)
- **`drop-documented`** — intentionally no v2 test (rationale required)

### 2. Merge gate (normative)

**No phase 07 deletion PR merges** unless:

1. Disposition table is **100% filled** for every test file under `packages/hub-daemon/test/**` that imports or exercises FDK/mount/bundle/worker paths (inventory produced in 07-pre P1).
2. Every row tagged **`security`** or referencing `acceptance.md` / mount / worker-env has disposition **`port`** (with replacement path) or **`drop-documented`** (reviewed rationale — not empty).
3. CI green after deletions with **`pnpm test`** / **`pnpm test:acceptance`**.

### 3. Security tests rule

Tests covering mount collision, worker environment sanitization, install policy, or grant-scoped tool surfaces **must not** be deleted without either:

- A **named v2 replacement test** (checkpoint apply, space index, invoke ACL, etc.), or  
- **`drop-documented`** entry explaining why FDK-specific threat model no longer applies post-07.

### 4. Process owner

**07-pre P1** produces the inventory; **07 M3** executes it. Phase 08 rewrites `studio-specs/current/acceptance.md` to v2 rows ([decision 10](./10-reference-workflow-verification-layered.md)).

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [07-legacy-fdk-deletion.md](../07-legacy-fdk-deletion.md) | M3 links to disposition table; merge gate |
| 07-pre checklist | Add P1 “complete test disposition table” |
| New `07-fdk-test-disposition.md` | Created during 07-pre execution |

---

*End of decision 11.*
