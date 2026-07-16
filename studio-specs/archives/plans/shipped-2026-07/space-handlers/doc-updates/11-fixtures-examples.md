# Review — Fixtures and examples

**Date:** 2026-07-09  
**Scope:** `examples/flows/**`, `studio-specs/current/fixtures/spaces/**`, `studio-specs/current/fixtures/reference-workflow/**`  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** MIXED

## Executive summary

Only `examples/flows/preview-review-v2/.mrmr/` is a fully compliant reference tree (passes `docs-proof` `10-T1` strict apply). All other flow examples remain under legacy `murrmure/` and fail strict parse. Normative fixtures include `minimal-murrmure` under `murrmure/` layout. P0 work: migrate CLI scaffold output to handlers-only and add a compliant minimal fixture.

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| F-001 | blocking | `examples/flows/team-brief-v2/murrmure/` | Fails strict parse (`10-T2`) — legacy `invoke:` | Migrate to `.mrmr/` + handlers; unblock Tutorial 02 |
| F-002 | blocking | `examples/flows/daily-brief-v2/murrmure/` | Fails strict parse (`10-T3`) — legacy `checkpoint:` | Migrate to `.mrmr/` + handlers; unblock Tutorial 03 |
| F-003 | blocking | `examples/flows/hello-authoring/murrmure/` | Fails strict parse (flows-tutorial reference) | Migrate or remove from docs references |
| F-004 | major | `examples/flows/preview-review-v2/murrmure/` | Dual legacy mirror alongside `.mrmr/` | Delete `murrmure/` subtree after confirming no CI deps |
| F-005 | major | `studio-specs/current/fixtures/spaces/minimal-murrmure/` | Fixture uses `murrmure/actions.yaml` layout | Create `minimal-mrmr/` with `.mrmr/space/handlers.yaml` |
| F-006 | major | `packages/cli/templates/space/manifest.json` | Still seeds empty `actions.yaml`, `hooks.yaml`, `executors.yaml` alongside handlers | P0: handlers-only template; legacy files optional/deprecated |
| F-007 | major | `examples/flows/orchestrator-with-review/` | No `.mrmr/` tree found | Migrate or mark archived |
| F-008 | minor | `fixtures/reference-workflow/preview-review-v2-apply.json` | Golden fixture may reference actions index | Update expected index shape for handlers |
| F-009 | minor | `preview-review-v2/README.md` | May reference both trees | Document `.mrmr/` as sole canonical path |
| F-010 | info | `preview-review-v2/.mrmr/space/handlers.yaml` | **Compliant reference** — 4 handlers with contract_keys | Link from all tutorials and specs |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates

- `examples/flows/preview-review-v2/murrmure/` — legacy mirror after dual-tree period ends
- `studio-specs/current/fixtures/spaces/minimal-murrmure/` — after `minimal-mrmr/` replacement lands

## Missing coverage

- **P0** `minimal-mrmr` fixture: smallest strict-apply space (space.yaml + handlers.yaml + one flow)
- **P0** scaffold template emitting handlers-only default
- Example README index table showing apply strict status per example
- Golden fixture for handler event dispatch (`on-dev-failure` migration)
- `hello-gate` template update under `.mrmr/` for `mrmr space flow init`

## Cross-links

- Related reviews: [01-docs-tutorial-preview-review.md](./01-docs-tutorial-preview-review.md), [02-docs-tutorials-multi-brief-daily.md](./02-docs-tutorials-multi-brief-daily.md), [10-spaces-root-demo.md](./10-spaces-root-demo.md), [12-docs-enforcement-gaps.md](./12-docs-enforcement-gaps.md)
