# Archived v2 tutorials — historical only

> **Do not follow these tutorials.** They describe the removed v2 runtime
> (`action:invoke`, `gate:resolve`, checkpoint gates, `awaiting_human`, base64
> `PUT /v1/artifacts`, `mrmr action invoke`) and are kept only as an audit trail
> of the v2 → v3 cutover (Task 15, Lane C). They never override
> [current/](../../../current/) and are excluded from active-guidance
> enforcement (`check:clean-state`, docs-proof).

## Canonical path

New users start with **[Tutorial 1a — First flow (v3)](../../../current/)** —
the only active introductory tutorial, shipped under
`apps/docs/guide/tutorials/01-local-preview-review-v3/`. It teaches the clean
protocol: `connection create/activate`, `step:resolve`, `flow:run`,
`event:emit`, handler dispatch on `on::key`, and the upload-intent artifact
path.

## What was archived

| Archived tutorial | Superseded by |
|-------------------|---------------|
| `01-local-preview-review/` (1b, 9 parts) | Tutorial v3 `1a` (6 parts) — nested build/review now lives in the v3 flow + handlers |
| `02-multi-agent-brief/` (3 parts) | Tutorial v3 `1a` + [Space handlers](../../../current/bridges/handlers.md) event-handler model |
| `03-daily-brief-trigger/` (4 parts) | Tutorial v3 `1a` + event handlers (`on: event:`) in `handlers.yaml` |

## Why

Task 15 Lane A removed the v2 runtime from production; Lane C retired the
matching docs so active guidance describes only the clean protocol. See the
`CHANGELOG.md` "Task 15 Lane C" entry and the coordinating plan
`studio-specs/plans/2026-07-14-tutorial-v3-build-tasks/15-legacy-v2-runtime-typecheck-and-docs.md`.
