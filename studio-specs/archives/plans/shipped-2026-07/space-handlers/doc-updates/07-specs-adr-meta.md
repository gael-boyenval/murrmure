# Review — ADR and meta index

**Date:** 2026-07-09  
**Scope:** `studio-specs/ADR/`, `studio-specs/current/index.md`, `studio-specs/current/overview.md`, `studio-specs/current/build-capability/README.md`  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** MIXED

## Executive summary

No ADR records the handlers + `.mrmr/` cutover — a gap given ADR-003 covers space-flow-protocol-v2 but not execution relocation to handlers. The spec index and build-capability README still foreground the FDK flow-push pipeline (`@murrmure/flow-dev-kit`, install HTTP, bundled skill). Meta docs need ADR-004 plus index rows for `bridges/handlers.md` and de-emphasis of retired FDK surfaces.

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| A-001 | major | `studio-specs/ADR/` | No ADR for handlers cutover | **Create ADR-004**: handlers.yaml, contract_keys, `.mrmr/` layout, deprecate actions/hooks/executors |
| A-002 | major | `current/index.md` | "Flow platform (Murrmure FDK)" section; links flow-dev-kit, install HTTP | Add "Space handlers" row; mark FDK section historical |
| A-003 | major | `current/index.md` | Missing `bridges/handlers.md` in index tables | Add under Platform foundations or new "Space execution" row |
| A-004 | major | `build-capability/README.md` | One-line goal: `murrmure/` + FDK iframe bundles | `.mrmr/` + indexed views; FDK non-goal |
| A-005 | major | `build-capability/README.md` | Links `capabilities-tutorial.md` (may not exist) | Verify link target; remove or redirect |
| A-006 | major | `current/overview.md` | Platform overview duplicates stale content (see review 06) | Rewrite after product/cli specs |
| A-007 | minor | `ADR/ADR-003-space-flow-protocol-v2.md` | Does not mention handler execution model | Add amendment pointer to ADR-004 |
| A-008 | minor | `current/index.md` | `15-agent-skill-package.md` references `murrmure-flow` monolith | Split skills ADR note |
| A-009 | info | `build-capability/06-install-push-apply-http-contract.md` | Listed as normative; install HTTP 404 on shipped hub | Index should mark retired |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates

- None in ADR folder. Consider archiving entire `build-capability/` subtree to `archives/` after ADR-004 clarifies local-first `.mrmr/` apply as the only path.

## Missing coverage

- **ADR-004** decision record: handlers replace actions+hooks+executors; strict lint bans `executor.action`; dual-write period end date
- Index precedence note: `handlers.md` overrides `action-invoke.md` for flow step execution
- Changelog entry in `studio-specs/README.md` for 2026-07-09 cutover

## Cross-links

- Related reviews: [05-specs-bridges.md](./05-specs-bridges.md), [06-specs-product-hub-flow.md](./06-specs-product-hub-flow.md), [12-docs-enforcement-gaps.md](./12-docs-enforcement-gaps.md)
