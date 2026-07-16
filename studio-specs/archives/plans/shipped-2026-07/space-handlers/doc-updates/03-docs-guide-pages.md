# Review — Guide pages (non-tutorial)

**Date:** 2026-07-09  
**Scope:** `apps/docs/guide/*.md` (18 pages, excluding `tutorials/`)  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** STALE

## Executive summary

Sixteen substantive guide pages (plus `known-gaps.md` and `multi-agent-feature-spec.md`) overwhelmingly describe the pre-cutover `murrmure/` space index, `actions.yaml` / `hooks.yaml` execution, and legacy step kinds. A few pages (`creating-flows.md`, `cli.md` partial, `troubleshooting.md` partial) acknowledge v2 step contracts but stop short of handlers. `flows-tutorial.md` is the worst offender — a full legacy authoring reference that fails strict apply and should be deleted or replaced by a handlers-first field guide.

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| G-001 | blocking | `guide/flows-tutorial.md` | Entire layout teaches `murrmure/actions.yaml`, `hooks.yaml`, `invoke:`/`checkpoint:` manifests | **DELETE** or replace with handlers + `.mrmr/` field reference sourced from `preview-review-v2` |
| G-002 | blocking | `guide/space-index.md` | Canonical layout is `murrmure/` with actions/executors/hooks | Rewrite for `.mrmr/{space,flows,views,dev}` + `handlers.yaml` |
| G-003 | blocking | `guide/creating-flows.md` | File table lists `murrmure/actions.yaml`, `murrmure/hooks.yaml` | Replace with handlers bridge; remove `executor.action` examples |
| G-004 | blocking | `guide/installation.md` | `space flow init` writes `murrmure/flows/…`, `actions.yaml`, `executors.yaml` | Document `.mrmr/` scaffold from `packages/cli/templates/space/manifest.json` |
| G-005 | major | `guide/quick-start.md` | Quick path uses `murrmure/` paths (7 occurrences) | Bulk path update + handlers mention |
| G-006 | major | `guide/how-it-fits-together.md` | Architecture diagram uses `murrmure/` index (9 occurrences) | Redraw with handlers dispatch layer |
| G-007 | major | `guide/cli.md` | `murrmure_invoke_action` as primary agent path; `murrmure/` paths | Add `mrmr step resolve`, handler doctor; note invoke is legacy/headless |
| G-008 | major | `guide/configuration.md` | Triggers via `murrmure/hooks.yaml` | Event handlers in `handlers.yaml` |
| G-009 | major | `guide/agent-skill.md` | Documents monolithic `murrmure` skill at `.cursor/skills/murrmure/` | Document split `murrmure-agent` + `murrmure-developer` variants |
| G-010 | major | `guide/agents-mcp.md` | Missing `murrmure_list_handlers`, event tools | Cross-link reference/mcp-tools after update |
| G-011 | major | `guide/review-workflow.md` | Review loop described via actions/invoke | Handler-owned build step + nested resolve_step |
| G-012 | major | `guide/desktop.md` | Space home references `murrmure/` indexing | `.mrmr/` apply semantics |
| G-013 | major | `guide/introduction.md` | Space definition includes `murrmure/` config dir | `.mrmr/` space directory |
| G-014 | major | `guide/multi-agent-feature-spec.md` | Edit path `murrmure/flows/, views/, hooks.yaml` | `.mrmr/` + handlers for cross-space triggers |
| G-015 | minor | `guide/troubleshooting.md` | Partial v2 awareness (`hooks.yaml` row) but no handler coverage | Add handler lint, contract_key mismatch, missing handlers.yaml |
| G-016 | minor | `guide/known-gaps.md` | Lists hooks as working surface | Sync with handlers cutover; reference split skills |
| G-017 | minor | `guide/why-murrmure.md` | One `murrmure/` path reference | Cosmetic path fix |
| G-018 | minor | `guide/shell-routes.md` | One legacy path | Update if space routes mention murrmure bundle |
| G-019 | info | `guide/creating-flows.md` | Notes "step resolve API ships in VS-2" — **shipped** | Remove stale deferral; link `mrmr step resolve` |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates

- `apps/docs/guide/flows-tutorial.md` — redundant with Tutorial 01, teaches rejected manifest shapes, referenced in `docs-proof` TUTORIAL_PAGES list (remove from list after delete)
- `apps/docs/guide/multi-agent-feature-spec.md` — consider merge into Tutorial 02 rewrite or archive; overlaps stale tutorial content

## Missing coverage

- Dedicated guide page: **Space handlers & contract keys** (user-facing bridge to `studio-specs/current/bridges/handlers.md`)
- **Step complete modes** (`auto` / `cli` / `explicit`) for handler authors
- **`mrmr step resolve`** operator/human path
- **`.mrmr/dev/`** local outputs and contract-keys codegen
- Split skill install and when to use agent vs developer skill

## Cross-links

- Related reviews: [01-docs-tutorial-preview-review.md](./01-docs-tutorial-preview-review.md), [04-docs-reference.md](./04-docs-reference.md), [08-skill-agent.md](./08-skill-agent.md), [09-skill-developer-legacy.md](./09-skill-developer-legacy.md)
