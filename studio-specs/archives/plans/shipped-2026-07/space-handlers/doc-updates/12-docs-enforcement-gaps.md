# Review — Docs enforcement and CI gaps

**Date:** 2026-07-09  
**Scope:** `packages/cli/test/docs-proof.test.ts`, `scripts/lib/fdk-docs-scan.mjs`, CI smoke tests  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** MIXED

## Executive summary

`docs-proof` provides valuable guards (FDK ban, legacy MCP tools ban, preview-review-v2 strict apply, executor.action ban in example manifests) but leaves large holes: tutorials still teach `murrmure/` paths and `hooks.yaml` without failing CI, root space is not linted, and normative spec drift is unchecked. Proposed new gates would align docs enforcement with handlers cutover code truth.

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| E-001 | major | `docs-proof.test.ts` | `TUTORIAL_PAGES` includes `flows-tutorial.md` but no ban on `murrmure/` layout in tutorials | Add pattern: tutorials must use `.mrmr/` not `murrmure/` (allowlist legacy mentions in migration notes) |
| E-002 | major | `docs-proof.test.ts` | No ban on `hooks.yaml` / `actions.yaml` as primary execution in tutorial prose | Fail if tutorial teaches `hooks.yaml` trigger chains without "legacy" qualifier |
| E-003 | major | `docs-proof.test.ts` | No ban on `executor.action` in `apps/docs/**` | Extend `VS-6` pattern to docs markdown |
| E-004 | major | `docs-proof.test.ts` | Root `.mrmr/space/` not in strict apply suite | Add `assertStrictApply(REPO_ROOT)` or dedicated handlers.yaml presence test |
| E-005 | major | `docs-proof.test.ts` | `VS-1` inline test still uses `executor.action` bundle — contradicts cutover | Update test fixture to handlers model or move to legacy regression suite |
| E-006 | major | `docs-proof.test.ts` | Known-gaps sync tied to legacy `packages/cli/skill/reference/known-gaps.md` | Retarget to split skill known-gaps |
| E-007 | minor | `fdk-docs-scan.mjs` | Scans FDK terms only | Add `murrmure/` layout scanner for apps/docs |
| E-008 | minor | `docs-proof.test.ts` | `LEGACY_RUNTIME_PATTERN` bans `.murrmure/link.json` in docs but cli spec still teaches it | Add spec sync test or extend ban to studio-specs/current |
| E-009 | info | CI pack-smoke (if exists) | May assert wrong layout path per 00-summary | Audit CI for `.mrmr/` assertion |
| E-010 | info | No doc-tracker | Spec index drift unchecked | Optional: script comparing `handlers.md` mentions in docs vs specs |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates

- `docs-proof.test.ts` `VS-1` inline manifest using `executor.action` — replace, don't delete test

## Missing coverage

### Proposed new CI gates

| Gate ID | Assertion | Target |
|---------|-----------|--------|
| DOC-LAYOUT-01 | No `murrmure/` as canonical space path in `apps/docs/guide/**` | Tutorials + guide |
| DOC-HANDLER-01 | `handlers.yaml` mentioned in Tutorial 01 index | Onboarding path |
| DOC-EXEC-01 | No `executor:\s+action:` in apps/docs markdown | All docs |
| SPACE-ROOT-01 | Repo root `.mrmr/space/handlers.yaml` exists + strict apply passes | Dogfood |
| SPEC-SYNC-01 | `studio-specs/current/product/spec.md` contains `handlers.yaml` | Normative drift |
| SKILL-SPLIT-01 | `packages/cli/skill/` monolith absent or not default install | Legacy removal |
| EXAMPLE-STRICT-01 | All `examples/flows/*/.mrmr/` pass strict apply (when present) | Examples matrix |

## Cross-links

- Related reviews: [03-docs-guide-pages.md](./03-docs-guide-pages.md), [11-fixtures-examples.md](./11-fixtures-examples.md), [10-spaces-root-demo.md](./10-spaces-root-demo.md), [07-specs-adr-meta.md](./07-specs-adr-meta.md)
