# Doc & spec gap reviews

**Context:** Post [handlers + `.mrmr/` cutover](../2026-07-09-space-handlers-contract-keys-plan.md) — audit whether user docs, normative specs, skills, and repo artefacts match shipped code.

**Normative code truth:** handlers + `contract_keys`, `.mrmr/{space,flows,views,dev}`, no `executor.action`, no `murrmure/` layout, no briefing, `mrmr step resolve`, split skills (`murrmure-agent` / `murrmure-developer`).

## Finding format (each review file)

Every subagent writes one file here using this shape:

```markdown
# Review — {title}

**Date:** YYYY-MM-DD  
**Scope:** {paths reviewed}  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** CURRENT | STALE | MIXED | DELETE-CANDIDATE

## Executive summary
{2–4 sentences}

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| X-001 | blocking | … | … | … |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates
- `{path}` — reason

## Missing coverage
- Topic not documented anywhere

## Cross-links
- Related reviews: …
```

## Index

| File | Vertical | Verdict |
|------|----------|---------|
| [00-summary.md](./00-summary.md) | Roll-up | **STALE (large gap)** |
| [01-docs-tutorial-preview-review.md](./01-docs-tutorial-preview-review.md) | Tutorial 01 | **STALE** |
| [02-docs-tutorials-multi-brief-daily.md](./02-docs-tutorials-multi-brief-daily.md) | Tutorials 02–03 | **STALE** |
| [03-docs-guide-pages.md](./03-docs-guide-pages.md) | Guide (non-tutorial) | **STALE** |
| [04-docs-reference.md](./04-docs-reference.md) | Reference | **NEEDS UPDATE** |
| [05-specs-bridges.md](./05-specs-bridges.md) | bridges/ | **MIXED** |
| [06-specs-product-hub-flow.md](./06-specs-product-hub-flow.md) | product/hub/cli specs | **STALE** |
| [07-specs-adr-meta.md](./07-specs-adr-meta.md) | ADR + meta | **MIXED** |
| [08-skill-agent.md](./08-skill-agent.md) | murrmure-agent | **MIXED** |
| [09-skill-developer-legacy.md](./09-skill-developer-legacy.md) | developer + legacy skill | **MIXED** |
| [10-spaces-root-demo.md](./10-spaces-root-demo.md) | .mrmr/space + demo-space | **FAIL** |
| [11-fixtures-examples.md](./11-fixtures-examples.md) | fixtures + examples | **MIXED** |
| [12-docs-enforcement-gaps.md](./12-docs-enforcement-gaps.md) | CI / docs-proof | **MIXED** |

## Remediation plan

After all reviews land: triage blocking → major, batch fixes by layer (code truth → specs → docs → skills → fixtures).

Recommended order (from [00-summary.md](./00-summary.md)):

1. **P0 code truth** — migrate root `.mrmr/space/`, `demo-space/`, CLI scaffold template (handlers-only)
2. **P0 normative specs** — rewrite `step-contract.md`, demote `action-invoke.md`; patch `product/spec.md` + `cli/spec.md`
3. **P1 tutorials** — Tutorial 01 full rewrite; delete 3 orphan pages; tutorials 02–03 rewrite or archive
4. **P1 skills** — expand `skill-agent` + `skill-developer`; delete `packages/cli/skill/`; migrate reference/*.md
5. **P2 guide + reference** — bulk `murrmure/` → `.mrmr/`; add handlers/complete modes/step resolve docs
6. **P2 examples** — migrate team-brief-v2, daily-brief-v2, hello-authoring to `.mrmr/`
7. **P3 CI** — extend `docs-proof` + doc-tracker for layout/hooks bans
8. **ADR-004** — record handlers cutover decision
