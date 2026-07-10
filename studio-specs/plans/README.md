# Plans — active implementation specs

> **On conflict, [current/](../current/) wins for shipped behavior.**

## Active

_No active implementation plans._ New work should start here only when a slice needs a tracked plan before landing in `current/`.

## Shipped (archived 2026-07-09)

All completed plans live under [`archives/plans/shipped-2026-07/`](../archives/plans/shipped-2026-07/):

| Archive folder / file | What shipped |
|-----------------------|--------------|
| `space-handlers/` | Handlers + contract keys; `.mrmr/` layout cutover; split skills; docs/spec remediation |
| `product-plan/` | Rev-5 phases 01–10 — v2 core B1–B10 |
| `mcp-reliability/` | MCP reliability Phases 0–4, 6 — `@murrmure/mcp-bridge`, hub input schemas, MCP-CUTOVER, doctor live probes, docs/skills sweep |
| `2026-07-07-step-contracts-unified-state-machine.md` | Step contracts v2.2 normative spec (VS-8) |
| `2026-07-08-step-contracts-vertical-slices.md` | VS-0–VS-8 delivery plan |
| `step-contracts-v21review-*.md` | Pre-ship review notes |
| `acceptance/` | Manual VS acceptance artifacts |
| `2026-07-07-tutorial1-unblock-discovery.md` | Feedback triage (Phases A–D) |
| `2026-07-07-tutorial1-phase-a-desktop-auth-plan.md` | Desktop view iframe auth (H2) |
| `2026-07-07-phase-a-findings.md` | Phase A.0 investigation log |

## Normative specs (not plans)

| Location | Role |
|----------|------|
| [current/product/spec.md](../current/product/spec.md) | Shipped product behavior |
| [current/product/deferred.md](../current/product/deferred.md) | Intentional non-goals |
| [archives/plans/product/](../archives/plans/product/) | Historical rev-1 drafts |

## Backlog symptoms

v2 core B1–B10: **closed** — see [known-gaps](../../apps/docs/guide/known-gaps.md).

Handlers cutover VS-0–VS-6: **closed** — see [space-handlers archive](../archives/plans/shipped-2026-07/space-handlers/README.md).

Remaining manual sign-off (Tutorial E2E, federation E2E, feedback closure) is tracked in archived orchestration logs under `space-handlers/` and `mcp-reliability/`.
