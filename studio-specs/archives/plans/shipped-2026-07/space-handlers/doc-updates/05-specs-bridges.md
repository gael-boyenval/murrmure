# Review — Normative bridges

**Date:** 2026-07-09  
**Scope:** `studio-specs/current/bridges/*.md` (14 files)  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** MIXED

## Executive summary

`bridges/handlers.md` correctly describes the shipped cutover model (`.mrmr/space/handlers.yaml`, `contract_keys`, no `executor.action`). However `step-contract.md` and `action-invoke.md` remain blocking stale: they still teach `executor.action` and `actions.yaml` indexing as the primary execution path. `product.md` and `bridges/feature-spec.md` retain FDK-era HTTP tables and `murrmure/` layout. `product.md` (capabilities) should be demoted; `feature-spec.md` capability doc is a separate legacy instance model.

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| B-001 | blocking | `bridges/step-contract.md` | All examples use `executor: { action: feature_* }` | Rewrite examples protocol-only; reference handlers.yaml for execution |
| B-002 | blocking | `bridges/action-invoke.md` | Normative for action invoke + `actions.yaml` index; step flows say "agent executor steps use explicit_resolve via invoke" | Demote to "headless invoke bridge"; point flow steps to `handlers.md` |
| B-003 | major | `bridges/product.md` | Space index table lists `GET …/actions`, `…/hooks`; apply indexes `murrmure/` | Add handlers index routes; `.mrmr/` paths; mark actions/hooks legacy |
| B-004 | major | `bridges/product.md` | References retired `agentStudio/kernelspecs/hub/studio-kernel-bridge.md` | Fix link to in-repo `hub/contracts.md` |
| B-005 | major | `bridges/triggers.md` | Likely still hook-centric (not re-read in full) | Align with event handlers in `handlers.yaml` |
| B-006 | major | `bridges/flow-engine.md` | May reference executor.action dispatch | Audit against `hub-core/flow-engine/handler-dispatch` |
| B-007 | minor | `bridges/handlers.md` | Status "in progress" — **shipped** | Update status to normative/shipped |
| B-008 | minor | `bridges/handlers.md` | Says legacy `murrmure/actions.yaml` accepted until HANDLER-CUTOVER | Clarify cutover date + strict mode behavior |
| B-009 | info | `bridges/grants-migration.md` | May lack `event:emit`, `step:resolve` | Add capability rows for new MCP tools |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates

- `studio-specs/current/bridges/product.md` — superseded by `handlers.md` + updated `product/spec.md` layout sections; archive after merge
- `studio-specs/current/capabilities/feature-spec.md` — legacy instance/state-machine capability model; not the preview-review v2 flow path; archive or move to `archives/`

## Missing coverage

- Bridge doc cross-link matrix: handlers ↔ step-contract ↔ triggers (single navigation path)
- `mrmr step resolve` wire map in bridges (CLI → HTTP → journal events)
- Handler lint warning codes reference table
- `bindings.yaml` bridge (when normative)

## Cross-links

- Related reviews: [06-specs-product-hub-flow.md](./06-specs-product-hub-flow.md), [04-docs-reference.md](./04-docs-reference.md), [01-docs-tutorial-preview-review.md](./01-docs-tutorial-preview-review.md)
