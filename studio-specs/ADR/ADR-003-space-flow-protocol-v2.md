# ADR-003 — Space–Flow–Protocol v2 promotion

**Status:** accepted (completed 2026-06-30)  
**Date:** 2026-06-30

## Context

Murrmure v1 shipped review-loop framing, instance-centric HTTP, Configure UI, and FDK install/evolution HTTP. rev-1 (2026-06-29) resolved entity model (Session + Run), hooks vs start conditions, CloudEvents journal, and space-directory indexing.

## Decision

Promoted rev-1 to [current/product/spec.md](../current/product/spec.md):

- v1 shims removed (MCP catalog v2 only).
- Space–Flow–Protocol v2 core shipped (phases 00–16).
- Architecture consolidated in [current/product/architecture.md](../current/product/architecture.md).

Full pre-promotion drafts archived at [archives/plans/product/](../archives/plans/product/).

## Consequences

- v1 clients migrate to session/run API and `murrmure_*` MCP tools.
- FDK worker install via public evolution HTTP removed; v2 indexed flows via `mrmr space apply`.
- Remaining work tracked in [plans/product/plan/index.md](../plans/product/plan/index.md) (backlog B1–B6).

## Amendment (2026-07-09)

Space execution relocated to **`handlers.yaml`** + **`.mrmr/` layout** — see [ADR-004](./ADR-004-handlers-mrmr-cutover.md). Flow manifests no longer carry `executor.action`; handlers bind via `contract_keys`.
