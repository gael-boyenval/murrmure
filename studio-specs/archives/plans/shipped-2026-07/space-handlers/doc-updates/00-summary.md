# Doc & spec gap review — executive summary

**Date:** 2026-07-09  
**Remediation executed:** 2026-07-09 (8 parallel agents)  
**Reviews:** 12 vertical audits (see index below)  
**Code baseline:** handlers cutover + `.mrmr/` layout (shipped 2026-07-09)

## Overall verdict: **REMEDIATED (P0–P2 complete)**

The handlers + `.mrmr/` cutover doc gap has been addressed across code truth, normative specs, tutorials, guide, reference, skills, examples, ADR, and CI enforcement. **`docs-proof` — 21/21 tests pass.**

## Remediation status by layer

| Layer | Before | After | Agent |
|-------|--------|-------|-------|
| Root + demo spaces | FAIL | **PASS** strict apply | P0 spaces |
| Normative bridges | MIXED | **CURRENT** | P0 bridges |
| Product/cli/overview specs | STALE | **CURRENT** (P-001–P-012) | P0 product/cli |
| Fixtures + examples | MIXED | **CURRENT** — all `.mrmr/` | P0 fixtures |
| Tutorial 01 | STALE | **CURRENT** — full rewrite | P1 tutorial 01 |
| Tutorials 02–03 | STALE | **CURRENT** — handlers model | P2 tutorials + ADR |
| Guide (non-tutorial) | STALE | **CURRENT** — 25 files | P2 guide + ref |
| Reference docs | NEEDS UPDATE | **CURRENT** | P2 guide + ref |
| skill-agent | MIXED | **CURRENT** v1.1.0 | P1 skills |
| skill-developer | MIXED | **CURRENT** v1.1.0 | P1 skills |
| Legacy `packages/cli/skill/` | harmful | **DELETED** | P1 skills |
| ADR-004 | missing | **CREATED** | P2 ADR |
| CI docs-proof | MIXED | **21 gates pass** | P2 CI |

## What was done (rollup)

1. **P0 code truth** — `.mrmr/space/handlers.yaml` (feedback events); `demo-space/.mrmr/`; handlers-only CLI scaffold
2. **P0 normative specs** — `step-contract.md`, `action-invoke.md` demoted; `product/spec.md`, `cli/spec.md`, `overview.md` rewritten
3. **P1 tutorials** — Tutorial 01 full rewrite + 3 orphan pages deleted; tutorials 02–03 rewritten
4. **P1 skills** — expanded split skills; deleted monolith; known-gaps retargeted
5. **P2 guide + reference** — bulk `.mrmr/` migration; new `space-handlers.md`; deleted `flows-tutorial.md`
6. **P2 examples** — team-brief-v2, daily-brief-v2, hello-authoring migrated; `minimal-mrmr` fixture
7. **P3 CI** — extended `docs-proof` (layout bans, root space, executor.action); ADR-004 + index updates

## Remaining minor drift (P3 follow-up)

| Item | Path | Notes |
|------|------|-------|
| Philosophy spec | `product/philosophy.md` | Still references `murrmure/views/` |
| Flow-runtime spec | `flow-runtime/spec.md` | `murrmure/flows/` paths |
| Archive refs | `studio-specs/archives/**` | Historical — no action needed |
| hello-authoring README | `examples/flows/hello-authoring/README.md` | Dead link to deleted `flows-tutorial.md` |
| `bridges/product.md` | capability doc | Candidate for archive per review B-delete |

## Review files

| File | Vertical | Before | After |
|------|----------|--------|-------|
| [01-docs-tutorial-preview-review.md](./01-docs-tutorial-preview-review.md) | Tutorial 01 | STALE | **REMEDIATED** |
| [02-docs-tutorials-multi-brief-daily.md](./02-docs-tutorials-multi-brief-daily.md) | Tutorials 02–03 | STALE | **REMEDIATED** |
| [03-docs-guide-pages.md](./03-docs-guide-pages.md) | Guide (non-tutorial) | STALE | **REMEDIATED** |
| [04-docs-reference.md](./04-docs-reference.md) | Reference | NEEDS UPDATE | **REMEDIATED** |
| [05-specs-bridges.md](./05-specs-bridges.md) | bridges/ | MIXED | **REMEDIATED** |
| [06-specs-product-hub-flow.md](./06-specs-product-hub-flow.md) | product/hub/cli specs | STALE | **REMEDIATED** |
| [07-specs-adr-meta.md](./07-specs-adr-meta.md) | ADR + meta | MIXED | **REMEDIATED** |
| [08-skill-agent.md](./08-skill-agent.md) | murrmure-agent | MIXED | **REMEDIATED** |
| [09-skill-developer-legacy.md](./09-skill-developer-legacy.md) | developer + legacy skill | MIXED | **REMEDIATED** |
| [10-spaces-root-demo.md](./10-spaces-root-demo.md) | .mrmr/space + demo-space | FAIL | **REMEDIATED** |
| [11-fixtures-examples.md](./11-fixtures-examples.md) | fixtures + examples | MIXED | **REMEDIATED** |
| [12-docs-enforcement-gaps.md](./12-docs-enforcement-gaps.md) | CI / docs-proof | MIXED | **REMEDIATED** |
