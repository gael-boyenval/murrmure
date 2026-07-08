# Plans — implementation specs (not yet shipped)

> **On conflict, [current/](../current/) wins for shipped behavior.**

## Index

| Location | Role | Status |
|----------|------|--------|
| [2026-07-07-tutorial1-unblock-discovery.md](./2026-07-07-tutorial1-unblock-discovery.md) | Feedback triage — Tutorial 1 unblock (all issues, Phase A–D) | Discovery complete |
| [2026-07-07-tutorial1-phase-a-desktop-auth-plan.md](./2026-07-07-tutorial1-phase-a-desktop-auth-plan.md) | Phase A — Desktop auth / intake `token_denied` | **Active** |
| [current/product/deferred.md](../current/product/deferred.md) | Intentional non-goals (not in backlog) | Normative |
| [current/product/spec.md](../current/product/spec.md) | Shipped product behavior | Normative |
| [archives/plans/product/](../archives/plans/product/) | Full rev-1 draft text (historical) | Archived |
| [archives/plans/cloud/](../archives/plans/cloud/) | Hosted shell | Not shipped |

**Removed (2026-07-07):** `product/plan/` (rev-5 phases 01–10) — superseded by feedback-driven discovery; v2 core B1–B10 shipped per [known-gaps](../../apps/docs/guide/known-gaps.md).

**Removed (2026-07-03):** redirect stubs `space-flow-protocol-v2.*`, `plan-delta-rev1.md`, `plans/product/deferred.md` — content lives in `current/product/` only.

## v2 core (shipped)

Delivered 2026-06-30 → [current/product/spec.md](../current/product/spec.md): space directory, invoke, session/run, gates API, flow engine (invoke/checkpoint/start_flow), hooks, federation, ViewCanvasHost, notifications, CLI/shell observer mode, setup wizards, unified skill.

Backlog symptoms B1–B10: **closed** — see [known-gaps](../../apps/docs/guide/known-gaps.md).

## Active work

| Track | Next step |
|-------|-----------|
| Tutorial 1 unblock | Execute [Phase A plan](./2026-07-07-tutorial1-phase-a-desktop-auth-plan.md) — start with manual investigation (A.0) in agentStudioTestEnv |

## Other deferred scope

Flow marketplace, gate delegation UI, cron trigger UI, contract graph editor, OAuth/IdP, admin-shell Storybook polish — see [current/product/deferred.md](../current/product/deferred.md).
