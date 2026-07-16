# Review — Product, hub, CLI normative specs

**Date:** 2026-07-09  
**Scope:** `studio-specs/current/product/spec.md`, `product/architecture.md`, `cli/spec.md`, `overview.md`, `hub/architecture.md` (skim)  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** STALE

## Executive summary

Normative product and CLI specs remain the largest source of truth drift. `product/spec.md` defines spaces as `murrmure/` directories with `actions.yaml` as first-class execution; `cli/spec.md` scaffolds `murrmure/` and documents monolithic skill install; `overview.md` still describes FDK worker mounts and `murrmure_wait_for_gate`. These specs actively mislead implementers and contradict shipped `handlers.md` + `.mrmr/` layout.

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| P-001 | blocking | `product/spec.md` | Glossary: Action in `actions.yaml` first-class; View in `murrmure/views/` | Add Handler + contract_key; paths `.mrmr/views/` |
| P-002 | blocking | `product/spec.md` | Space layout section (~L938) shows `murrmure/actions.yaml`, `executors.yaml`, `hooks.yaml` | Replace with `.mrmr/space/handlers.yaml` canonical layout |
| P-003 | blocking | `product/spec.md` | Flow manifest examples use `invoke:` / executor.action patterns | Protocol-only manifests per `preview-review-v2` |
| P-004 | blocking | `cli/spec.md` | `space init` scaffolds `murrmure/` (actions, executors, hooks) | Document `.mrmr/space/` scaffold; handlers.yaml required |
| P-005 | blocking | `cli/spec.md` | `space link` writes `.murrmure/link.json` | `.mrmr/space/space.yaml` link block; deprecate link.json |
| P-006 | blocking | `overview.md` | E2E review loop step 3: `murrmure_wait_for_gate` (removed) | `murrmure_wait_for_run` + `murrmure_resolve_step` |
| P-007 | blocking | `overview.md` | "indexed from `murrmure/`" throughout | `.mrmr/` |
| P-008 | major | `cli/spec.md` | Skill install copies to `.cursor/skills/murrmure/` | `murrmure-agent` + `murrmure-developer` variants |
| P-009 | major | `cli/spec.md` | Missing `mrmr step resolve` command | Add normative CLI section per `packages/cli/src/commands/step.ts` |
| P-010 | major | `product/spec.md` | Hook table: `murrmure/hooks.yaml` for space triggers | Event handlers in handlers.yaml |
| P-011 | major | `product/architecture.md` | Likely murrmure/ layout (grep confirms views path) | Path + execution model sweep |
| P-012 | major | `hub/architecture.md` | References `emit_event` without v2 `murrmure_emit_event` naming | Update MCP tool names |
| P-013 | minor | `overview.md` | FDK worker mount path in review loop | Handler dispatch + MCP platform tools |
| P-014 | info | `product/spec.md` | Phase table says all phases shipped @1.0.0 | Add handlers cutover as post-1.0 normative amendment |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates

- None wholesale — rewrite in place. Demote legacy sections to `archives/` appendices if needed for migration notes.

## Missing coverage

- Handler entity in product glossary (id, contract_keys, on, complete, type)
- Strict apply lint codes in product spec denial table
- Split skill packages in CLI spec
- `.mrmr/dev/contracts/contract-keys.json` in CLI `space doctor` output spec
- Space link.host persistence policy (from handlers bridge Q1)

## Cross-links

- Related reviews: [05-specs-bridges.md](./05-specs-bridges.md), [07-specs-adr-meta.md](./07-specs-adr-meta.md), [10-spaces-root-demo.md](./10-spaces-root-demo.md)
