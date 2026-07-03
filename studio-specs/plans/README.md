# Plans — implementation specs (not yet shipped)

> **On conflict, [current/](../current/) wins for shipped behavior.**  
> **`plans/product/plan/`** is the **normative implementation spec** for unfinished v2 surface (rev-4).

## Index

| Location | Role | Status |
|----------|------|--------|
| [product/plan/](./product/plan/) | **Active implementation spec** — phases 01–10, B1–B10 | **Active** — [index.md](./product/plan/index.md) |
| [current/product/deferred.md](../current/product/deferred.md) | Intentional non-goals (not in backlog) | Normative |
| [current/product/spec.md](../current/product/spec.md) | Shipped product behavior | Normative |
| [archives/plans/product/](../archives/plans/product/) | Full rev-1 draft text (historical) | Archived |
| [cross-space-xs1/](./cross-space-xs1/) | Federation relay extensions | Deferred |
| [archives/plans/cloud/](../archives/plans/cloud/) | Hosted shell | Not shipped |

**Removed (2026-07-03):** redirect stubs `space-flow-protocol-v2.*`, `plan-delta-rev1.md`, `plans/product/deferred.md` — content lives in `current/product/` or `product/plan/` only.

## v2 core (shipped)

Delivered 2026-06-30 → [current/product/spec.md](../current/product/spec.md): space directory, invoke, session/run, gates API, flow engine (invoke/matrix/start_flow), hooks, federation, `start.requires_view`, notifications, CLI/shell observer mode.

## Active spec summary (unshipped)

| ID | Topic | Phase |
|----|-------|-------|
| B1–B3 | Gate dispatch, step outputs, `MURRMURE_INPUT` | 02 |
| B4 | ViewCanvasHost + `gate.requires_view` | 06 |
| B5 | Apply engine lint | 01 |
| B6 | `mrmr space flow init` | 03 |
| B9 | View author SDK (`view-sdk/app`) | 03b |
| B10 | Preview-review loop | 02 + 10 |

Details: [product/plan/index.md](./product/plan/index.md)

## Other deferred scope

Flow marketplace, gate delegation UI, cron trigger UI, contract graph editor, OAuth/IdP, admin-shell Storybook polish — see [current/product/deferred.md](../current/product/deferred.md).
