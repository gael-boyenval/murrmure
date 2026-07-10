# Review — Reference docs

**Date:** 2026-07-09  
**Scope:** `apps/docs/reference/*.md` (6 pages)  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** NEEDS UPDATE

## Executive summary

Reference docs are closer to shipped code than tutorials — MCP tools correctly document `murrmure_resolve_step` and removed v1 tools. Gaps remain: three shipped handler/event MCP tools are absent from `mcp-tools.md`, environment vars omit handler child env, HTTP API omits step-contract and handler index routes, and path references still say `murrmure/` on apply. No blocking contradictions, but integrators cannot discover handler/event tooling from docs alone.

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| R-001 | major | `reference/mcp-tools.md` | Missing `murrmure_list_handlers` (shipped, tested in `list-handlers.test.ts`) | Add table row: capability `space:read`, lists handler ids + contract_keys |
| R-002 | major | `reference/mcp-tools.md` | Missing `murrmure_list_emittable_events` | Document `event:emit` capability requirement |
| R-003 | major | `reference/mcp-tools.md` | Missing `murrmure_emit_event` | Document args (`type`, `source`, `data`); note replaces removed v1 `emit_event` |
| R-004 | major | `reference/mcp-tools.md` | "Removed v1" section says `emit_event` fully removed — true for v1 name but v2 `murrmure_emit_event` exists | Clarify v1 vs v2 naming; link event handler authoring |
| R-005 | major | `reference/http-api.md` | No `GET /v1/runs/{id}/step-contracts` | Add route (used by `murrmure_list_step_contracts`) |
| R-006 | major | `reference/http-api.md` | No `POST /v1/runs/{id}/steps/{step_id}/resolve` in platform table (only mentioned in prose) | Add to platform API table with `step:resolve` scope |
| R-007 | major | `reference/http-api.md` | Apply route says "Index `murrmure/` bundle" | "Index `.mrmr/` bundle" |
| R-008 | major | `reference/environment.md` | `shell_spawn` child env table incomplete vs `action-invoke.md` bridge | Add `MURRMURE_PROMPT`, `MURRMURE_INPUT`; document handler-injected template vars |
| R-009 | minor | `reference/agent-skill.md` | Points to monolithic skill | Split variants + install flags |
| R-010 | minor | `reference/view-sdk.md` | View paths under `murrmure/views/` (12 refs) | `.mrmr/views/` |
| R-011 | minor | `reference/shell-client.md` | Legacy space path references | Path sweep |
| R-012 | info | `reference/mcp-tools.md` | `murrmure_invoke_action` still documented | Add note: headless/legacy; flow steps use handlers + `resolve_step` |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates

- None

## Missing coverage

- HTTP routes for handler index / emittable events (if exposed beyond MCP)
- `murrmure_space_health` handler coverage fields
- `event:emit` capability in grants table
- `mrmr step resolve` CLI reference (could live in reference or cli guide)
- JSON examples for `murrmure_list_handlers` and `murrmure_emit_event` responses

## Cross-links

- Related reviews: [05-specs-bridges.md](./05-specs-bridges.md), [08-skill-agent.md](./08-skill-agent.md), [12-docs-enforcement-gaps.md](./12-docs-enforcement-gaps.md)
