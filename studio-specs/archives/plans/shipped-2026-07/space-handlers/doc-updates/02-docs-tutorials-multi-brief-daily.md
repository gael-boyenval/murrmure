# Review — Tutorials 02–03 (multi-agent brief, daily brief)

**Date:** 2026-07-09  
**Scope:** `apps/docs/guide/tutorials/02-multi-agent-brief/**`, `apps/docs/guide/tutorials/03-daily-brief-trigger/**`  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** STALE

## Executive summary

Tutorials 02 and 03 teach cross-space orchestration via legacy flow step kinds (`invoke:`, `gate:`, `checkpoint:`) and `hooks.yaml` event chains. Strict apply rejects these manifests today — confirmed by `packages/cli/test/docs-proof.test.ts` (`10-T2` team-brief-v2, `10-T3` daily-brief-v2). Both tutorials need full rewrites to handlers + unified step contracts, or archival with a "not yet migrated" banner.

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| T02-001 | blocking | `02-multi-agent-brief/01-build-orchestrator-flow.md` | Manifest uses top-level `invoke:` and `gate:` steps | Migrate to `branches` + `presentation` / handler-bound executor steps per `step-contract.md` |
| T02-002 | blocking | `02-multi-agent-brief/01-build-orchestrator-flow.md` | Documents `murrmure/actions.yaml` + `murrmure/hooks.yaml` for `brief.published` wake | Replace with event handler in `.mrmr/space/handlers.yaml` (`on: event: { type: brief.published }`) |
| T02-003 | blocking | `03-daily-brief-trigger/01-scaffold-daily-brief.md` | Manifest uses `checkpoint:` and `invoke:` step kinds | Rewrite using `presentation` views + handler dispatch; align with migrated `daily-brief-v2/.mrmr/` when available |
| T02-004 | blocking | `03-daily-brief-trigger/02-push-and-trigger.md` | `hooks.yaml` chain with `invoke:` action steps for `brief.requested` | Event handler with `contract_keys: []` + `murrmure_emit_event` / `query_ask` per cross-space spec |
| T02-005 | major | `02-multi-agent-brief/index.md` | Architecture diagram shows `hooks.yaml ──brief.published──►` agent wake | Redraw: journal event → handler → shell_spawn agent |
| T02-006 | major | `03-daily-brief-trigger/index.md` | Lists `hooks.yaml` and `actions.yaml` as primary space files | List `handlers.yaml` (+ optional `bindings.yaml`) |
| T02-007 | major | `02-multi-agent-brief/03-connect-agents.md` | Grant scopes centered on `action:invoke` for cross-space agents | Document `step:resolve`, `space:read`, `event:emit`, `query_ask` for federated reads |
| T02-008 | major | `02-multi-agent-brief/04-run-workflow.md` | Troubleshooting assumes hook apply failure | Add handler lint + `murrmure_list_handlers` coverage checks |
| T02-009 | major | `03-daily-brief-trigger/04-run-and-review.md` | Run flow assumes legacy gate/checkpoint resolution | Use `murrmure_resolve_step` + view submit paths |
| T02-010 | minor | `tutorials/index.md` | Glossary defines Action/Hook in `murrmure/actions.yaml` / `hooks.yaml` | Update glossary: Handler, contract_key, emittable event |
| T02-011 | info | `examples/flows/team-brief-v2/`, `examples/flows/daily-brief-v2/` | Examples still under `murrmure/` and fail strict parse | Migrate examples before tutorial rewrite (see review 11) |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates

- None individually — prefer rewrite over delete. If migration is deferred, add archive stubs redirecting to Tutorial 01 + handlers bridge doc.

## Missing coverage

- Event handlers (`on: event`) replacing hook chains
- `murrmure_list_emittable_events` / `murrmure_emit_event` for trigger authoring
- Cross-space `query_ask` (`spec_summary@1`) as alternative to wake-via-hook
- Federation binding via `bindings.yaml` (when shipped)
- Tutorial prerequisite: completed Tutorial 01 with handlers model

## Cross-links

- Related reviews: [01-docs-tutorial-preview-review.md](./01-docs-tutorial-preview-review.md), [11-fixtures-examples.md](./11-fixtures-examples.md), [04-docs-reference.md](./04-docs-reference.md)
