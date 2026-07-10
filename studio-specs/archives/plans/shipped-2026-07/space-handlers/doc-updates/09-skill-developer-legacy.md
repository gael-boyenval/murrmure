# Review — murrmure-developer skill + legacy monolith

**Date:** 2026-07-09  
**Scope:** `packages/cli/skill-developer/`, `packages/cli/skill/` (monolith + `reference/*.md`)  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** MIXED

## Executive summary

`murrmure-developer` is a useful stub pointing at `.mrmr/` layout and handlers.yaml but lacks depth for flow/view authoring. The legacy `packages/cli/skill/` monolith still ships via default `mrmr skill install` paths in docs and contains actively harmful reference docs (`actions-executors.md`, `hooks-triggers.md`) that teach rejected patterns. The monolith should be deleted after migrating salvageable reference content into split skills.

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| D-001 | blocking | `packages/cli/skill/reference/actions-executors.md` | Teaches `invoke:` steps, `murrmure/actions.yaml`, `murrmure_invoke_action` as flow path | **DELETE** or rewrite as historical appendix in archives |
| D-002 | blocking | `packages/cli/skill/reference/hooks-triggers.md` | Teaches `hooks.yaml` event chains | **DELETE**; replace with event handler section in developer skill |
| D-003 | blocking | `packages/cli/skill/reference/platform-model.md` | Execution flow step 3: `invoke`, `checkpoint` kinds | Rewrite for unified step contracts + handlers |
| D-004 | major | `packages/cli/skill/SKILL.md` | Monolithic skill still exists; `name: murrmure` | Remove package; make `skill-agent` + `skill-developer` only install targets |
| D-005 | major | `skill-developer/SKILL.md` | Stub only (~28 lines); no flow authoring, view scaffold, handler examples | Expand: handler templates, contract_keys wiring, strict apply loop |
| D-006 | major | `skill/reference/flow-authoring.md` | Likely legacy manifest shapes | Audit and migrate to developer skill |
| D-007 | major | `skill/reference/space-directory.md` | `murrmure/` layout | `.mrmr/` + handlers |
| D-008 | minor | `skill/reference/mcp.md` | May omit new MCP tools | Sync with `apps/docs/reference/mcp-tools.md` |
| D-009 | minor | `packages/cli/test/docs-proof.test.ts` | Known-gaps sync still reads `packages/cli/skill/reference/known-gaps.md` | Point test at agent or developer skill reference after migration |
| D-010 | info | `packages/cli/src/skill/install.ts` | Split variants exist (`agent`, `developer`) but docs don't teach them | Default install both or prompt for variant |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates

- `packages/cli/skill/` — entire legacy monolith directory after reference migration
- `packages/cli/skill/reference/actions-executors.md` — harmful; teaches rejected invoke model
- `packages/cli/skill/reference/hooks-triggers.md` — harmful; teaches rejected hooks model
- `packages/cli/skill/SKILL.md` — superseded by split skills

## Missing coverage

- Developer skill: full handler authoring example (preview-review handlers.yaml walkthrough)
- `mrmr space flow init` / `view init` with `.mrmr/` output paths
- Strict lint code reference for authors
- `contract-keys.json` consumption workflow
- Migration guide: actions.yaml → handlers.yaml for existing spaces

## Cross-links

- Related reviews: [08-skill-agent.md](./08-skill-agent.md), [03-docs-guide-pages.md](./03-docs-guide-pages.md), [10-spaces-root-demo.md](./10-spaces-root-demo.md)
