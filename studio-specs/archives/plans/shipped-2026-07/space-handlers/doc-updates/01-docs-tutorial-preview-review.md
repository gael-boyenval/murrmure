# Review — Tutorial 01 (local preview review)

**Date:** 2026-07-09  
**Scope:** `apps/docs/guide/tutorials/01-local-preview-review/**`  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** STALE

## Executive summary

Tutorial 01 is the flagship onboarding path but still teaches the pre-cutover space model: `murrmure/` layout, `actions.yaml` prompt triggers, and `executor.action` in flow manifests. The normative example at `examples/flows/preview-review-v2/.mrmr/` uses `handlers.yaml` + `contract_keys` with protocol-only manifests — a reader following the tutorial cannot pass `mrmr space apply --strict`. Three orphan pages duplicate or contradict the indexed page list and should be deleted.

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| T01-001 | blocking | `01-local-preview-review/index.md` | Teaches space = repo + `murrmure/`; links to `actions.yaml` prompt triggers | Rewrite intro: `.mrmr/space/handlers.yaml`, `contract_keys`, protocol-only manifest |
| T01-002 | blocking | `01-local-preview-review/05-flow-manifest.md` | Full manifest uses `executor: { action: feature_* }` on every agent step | Remove `executor` blocks; wire execution in `handlers.yaml` per `preview-review-v2/.mrmr/space/handlers.yaml` |
| T01-003 | blocking | `01-local-preview-review/04-prompt-triggers.md` | Entire page documents `murrmure/actions.yaml` prompts as execution model | Replace with handlers page: `on: step.opened`, `complete: explicit`, `murrmure_resolve_step` in prompt |
| T01-004 | blocking | `01-local-preview-review/01-scaffold-flow.md` | Clone/scaffold path references `murrmure/` tree and legacy `hello-gate` template with actions | Point to `.mrmr/` example clone; document `mrmr space flow init` output under `.mrmr/flows/` |
| T01-005 | blocking | `01-local-preview-review/06-build-views.md` | View paths under `murrmure/views/` | Update to `.mrmr/views/{id}/` |
| T01-006 | blocking | `01-local-preview-review/07-index-and-apply.md` | Apply indexes `murrmure/` bundle | Document `.mrmr/` apply + handler coverage warnings from `mrmr space doctor` |
| T01-007 | blocking | `01-local-preview-review/08-run-the-loop.md` | Assumes action-dispatched agent steps | Document handler dispatch on `step.opened` + nested `build.build-loop` / `build.review` resolve flow |
| T01-008 | major | `01-local-preview-review/02-setup-wizard.md` | Grant mint lists `action:invoke` as primary agent capability | Add `step:resolve`, `event:emit` where relevant; mention split skills (`murrmure-agent` / `murrmure-developer`) |
| T01-009 | major | `01-local-preview-review/03-agent-md-and-skills.md` | Contrasts `murrmure/actions.yaml` prompts vs `agent.md` | Contrast `handlers.yaml` prompts vs `agent.md` / `skills/feature-build/SKILL.md` |
| T01-010 | major | `01-local-preview-review/01-create-the-repo.md` | OK for repo bootstrap but no `.mrmr/` mention before Part 2 | Add forward pointer to `.mrmr/space/` scaffold in Part 2 |
| T01-011 | major | `01-local-preview-review/09-troubleshooting.md` | Documents `LEGACY_STEP_KIND` but not `executor.action` lint or missing handler coverage | Add rows for `HANDLER_COVERAGE`, `executor.action` ban, missing `contract_keys` |
| T01-012 | minor | `01-local-preview-review/index.md` | Page list omits scaffold/install orphans but repo still contains them | Delete orphans (see below); keep single canonical path |
| T01-013 | info | `examples/flows/preview-review-v2/.mrmr/flows/preview-review/flow.manifest.yaml` | Compliant reference exists but tutorial never links `.mrmr/` tree | Add "compare with example" links to `.mrmr/` paths throughout |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates

- `apps/docs/guide/tutorials/01-local-preview-review/01-scaffold-flow.md` — duplicate alternate Part 1; contradicts indexed `01-create-the-repo.md`; still uses `murrmure/` + legacy scaffold
- `apps/docs/guide/tutorials/01-local-preview-review/02-install-and-connect.md` — duplicate of `02-setup-wizard.md`; not linked from tutorial index
- `apps/docs/guide/tutorials/01-local-preview-review/03-run-feedback-loop.md` — FDK-era page (`create_preview_review_session`, `wait_for_review`); banned by `docs-proof` FDK pattern; not in index

## Missing coverage

- `handlers.yaml` authoring walkthrough with `contract_keys` from `.mrmr/dev/contracts/contract-keys.json`
- `mrmr step resolve` CLI for human/view-driven branch resolution
- `complete: parent` / `goto:` nested step semantics tied to handler `kill_on: step.resolved`
- Split skill install (`mrmr skill install --variant agent|developer`)
- Dual-tree note: example still has legacy `murrmure/` mirror — tutorial should teach `.mrmr/` only

## Cross-links

- Related reviews: [02-docs-tutorials-multi-brief-daily.md](./02-docs-tutorials-multi-brief-daily.md), [11-fixtures-examples.md](./11-fixtures-examples.md), [08-skill-agent.md](./08-skill-agent.md)
