# Plans — active implementation specs

> **On conflict, [current/](../current/) wins for shipped behavior.**

## Active

| Plan | Status | Summary |
|------|--------|---------|
| [2026-07-09-mcp-reliability-plan.md](./2026-07-09-mcp-reliability-plan.md) | **Active** | Consolidated MCP issues (catalog discovery, empty input schemas, doctor gaps, CLI→hub HTTP migration) |

## Shipped (archived 2026-07-09)

All completed plans moved to [`archives/plans/shipped-2026-07/`](../archives/plans/shipped-2026-07/):

| Archive folder / file | What shipped |
|-----------------------|--------------|
| `product-plan/` | Rev-5 phases 01–10 — v2 core B1–B10 |
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

Open agent-loop work is tracked in the MCP reliability plan above and [`feedbacks/`](../../feedbacks/) (MCP-related files listed in that plan).
