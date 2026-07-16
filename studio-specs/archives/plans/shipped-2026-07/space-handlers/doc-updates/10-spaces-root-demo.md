# Review — Root space + demo-space

**Date:** 2026-07-09  
**Scope:** `.mrmr/space/` (repo root), `demo-space/`  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** FAIL

## Executive summary

Both live spaces in the repo fail the handlers cutover standard. Root `.mrmr/space/` has legacy `actions.yaml`, `executors.yaml`, `hooks.yaml`, and events.yaml but **no `handlers.yaml`** — the feedback agent cannot be expressed in the new model without migration. `demo-space/` still uses the entire legacy `demo-space/murrmure/` tree and fails strict parse per `docs-proof` test `10-U5`.

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| S-001 | blocking | `.mrmr/space/` | Missing `handlers.yaml` | Create handlers for `run_feedback_agent` workflow using event handlers |
| S-002 | blocking | `.mrmr/space/actions.yaml` | `run_feedback_agent` action with shell executor | Migrate to handler: `on: event: murrmure.feedback.*`, `type: shell_spawn`, `complete: auto` |
| S-003 | blocking | `.mrmr/space/hooks.yaml` | Hook chains `on-dev-failure` / `on-dev-improvement` with `invoke:` steps | Replace with two event handlers in handlers.yaml |
| S-004 | blocking | `demo-space/murrmure/` | Full legacy layout; `flow.manifest.yaml` uses `invoke:` | Migrate to `demo-space/.mrmr/` or delete demo-space if redundant with examples |
| S-005 | major | `.mrmr/space/executors.yaml` | Standalone executors file | Fold into handler `type: shell_spawn` bindings or remove after handler migration |
| S-006 | major | `.mrmr/space/events.yaml` | Parallel events catalog | Align with `murrmure_list_emittable_events` or merge into handlers event declarations |
| S-007 | major | `demo-space/murrmure/flows/demo/flow.manifest.yaml` | Legacy invoke steps | Rewrite protocol-only + handlers or archive demo |
| S-008 | minor | `.mrmr/space/space.yaml` | Only slug + link — OK structurally | Add handler coverage comment after migration |
| S-009 | info | `packages/cli/templates/space/manifest.json` | Scaffold **does** include empty `handlers.yaml` | Root space predates template fix — apply template pattern manually |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates

- `demo-space/murrmure/` — after migration to `.mrmr/` or removal of demo-space entirely
- `.mrmr/space/actions.yaml`, `hooks.yaml`, `executors.yaml` — after handler migration (keep until cutover verified)

## Missing coverage

- Root space as **dogfood reference** for event handlers (feedback loop) — should be documented in tutorials
- CI gate: root `.mrmr/space/` must pass `mrmr space apply --strict`
- `demo-space/` purpose statement in README — keep or delete decision

## Cross-links

- Related reviews: [11-fixtures-examples.md](./11-fixtures-examples.md), [12-docs-enforcement-gaps.md](./12-docs-enforcement-gaps.md), [01-docs-tutorial-preview-review.md](./01-docs-tutorial-preview-review.md)
