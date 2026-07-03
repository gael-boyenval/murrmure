# rev-1 plan delta — intentionally in-scope items

**Status:** historical (v2 core shipped 2026-06-30)  
**Superseded by:** [plan/index.md](./plan/index.md) — post-v2 backlog only  
**Normative product spec:** [current/product/spec.md](../../current/product/spec.md)

---

## Purpose

rev-1 marks several capabilities as **deferred** or **reserved** in isolation. This plan **pulls them forward** into phased delivery. When rev-1 text says "defer" but this delta lists a phase, **the phase doc wins** for implementation scope.

The plan index statement *"Nothing in this plan is deferred"* means: **every agreed rev-1 + architecture + philosophy item has a phase owner** — not that rev-1 draft deferral markers are unchanged.

---

## Pulled forward (was deferred in rev-1)

| Item | rev-1 marker | Plan phase | Notes |
|------|--------------|------------|-------|
| **Flows calling flows** (`start_flow`, `flow_call`) | §5.5, §16 #7 deferred | [14-flow-call-composition](./plan/14-flow-call-composition.md) | Depends on flow engine (phase 09), not federation |
| **Legal hold** (`hold: true` on artifacts) | §7.4 defer | [04-artifacts-exchange](./plan/04-artifacts-exchange.md) | GC skips held artifacts |
| **Out-of-shell notifications** (email/desktop) | §16b O3 defer | [15-out-of-shell-notifications](./plan/15-out-of-shell-notifications.md) | Gates + run failed only |

---

## Explicitly still deferred (not in plan)

| Item | rev-1 reference | Rationale |
|------|-----------------|-----------|
| Gate quorum (`resolve_mode` beyond `any_one`) | §6.1 | v2 uses any-one only |
| In-hub queue runtime (Temporal-like) | §16b P4 | External poll workers only |
| Hub view registry / view entity | §5.4, architecture §5.1 | Views are clients; `view_ref` denormalized on flow index only |
| A2A as core protocol | phase 13 optional stub | Adapter only; not normative wire |

---

## Dependency corrections (vs initial plan draft)

| Phase | Correct `Depends on` | Rationale |
|-------|----------------------|-----------|
| 13 Federation | 12, 06, 07 | Shell federation UI + redaction need observer shell and gate rules |
| 14 Flow-call | 09 | Local composition; no cross-hub requirement |
| 16 Promotion | 14, 15, 11 | Custom views ship before final promotion |

Phases 13 and 14 may run **in parallel** after their respective dependencies are ✅.

---

## Architecture slice → plan phase crosswalk

| Slice (architecture §8) | Plan phase(s) | Notes |
|--------------------------|---------------|-------|
| A — Docs & types | 01 | Zod + ports |
| B — Space directory index | 02 | init/link/apply, grant mint |
| D — Action invoke + artifacts | 03, 04 | invoke then artifacts |
| C — Session + Run | 05 | ACL migration, MCP batch 1 |
| H — Notifications + logs | 06, 07 | shell foundation then notifications |
| E — Flow index + starts | 08, 09 | engine then flowchart/matrix |
| G — MCP orchestration attach | 10 | attach gate |
| F — Custom views | 11 | view-sdk |
| I — Federation | 12, 13 | queue poll then federation |
| — Flow-call (plan extension) | 14 | depends 09 only |
| — Out-of-shell notify | 15 | depends 07 |
| — Promotion | 16 | hygiene + current/ |

---

## Package naming (implementation convention)

Until phase 16 publish renames:

| Plan / architecture name | Workspace dir / package today |
|--------------------------|--------------------------------|
| `@murrmure/studio-contracts` | `packages/studio-contracts` (`@murrmure/contracts`) |
| `@murrmure/studio-hub-core` | `packages/studio-hub-core` (`@murrmure/hub-core`) |
| `@murrmure/studio-hub-daemon` | `packages/studio-hub-daemon` (`@murrmure/hub-daemon`) |
| `@murrmure/studio-hub-persistence` | `packages/studio-hub-persistence` (`@murrmure/hub-persistence`) |

Phase docs use **target names** in prose and **actual paths** in file checklists.

---

*End of plan delta.*
