# Doc, skill & MCP tracker

**Status:** phase 10 complete — final audit  
**Normative spec:** [current/product/spec.md](../../../current/product/spec.md) §21  
**Plan index:** [index.md](./index.md) (rev-5 sequential)

> **Rule:** Each phase updates docs/skills **in the same PR** as its code (see per-phase **Docs** sections). Phase **10** is the final doc audit; intermediate phases must not leave broken links to legacy worker install paths.
>
> **CI:** `check:doc-tracker` **warn-only from phase 01**; **strict (exit 1) from phase 10** ([decision 14](./decisions/14-doc-tracker-warn-from-phase-01.md)).
>
> **North-star guard:** human-facing UX docs must keep the same framing as [philosophy.md § North star](../../../current/product/philosophy.md#north-star-non-negotiable--2026-07-03): custom views are primary, shell chrome is admin/operator mode, built-in forms/drawers are fallback-only when a view is expected.

---

## Cross-cutting artifacts

| Artifact | Role |
|----------|------|
| `apps/docs/guide/known-gaps.md` | Human-facing gap list (empty when backlog shipped) |
| `packages/cli/skill/reference/known-gaps.md` | Agent-facing gap list — **must match human** |
| `packages/cli/skill/SKILL.md` | **`murrmure`** router (phase 07) |
| `studio-specs/current/acceptance.md` | Golden fixtures (phase 10) |
| `studio-specs/current/bridges/flow-engine.md` | Engine dispatch vs manifest |
| `studio-specs/current/bridges/action-invoke.md` | shell_spawn env |
| `studio-specs/current/product/philosophy.md` | North-star source wording |
| `studio-specs/current/shell/spec.md` | ViewCanvasHost primary vs shell fallback |
| `apps/docs/guide/{quick-start,desktop,flows-tutorial,review-workflow,tutorials/**}` | Human-facing UX narratives — view-first |

---

## North-star UX checklist (cross-phase)

- [x] Human docs never present shell chrome, drawer UI, or built-in gate forms as the primary path when checkpoint `view` is present
- [x] `ViewCanvasHost` named explicitly in shell/spec + view-sdk/review workflow docs
- [x] onboarding docs (`quick-start`, `desktop`) keep shell framed as operator handoff
- [x] tutorial and flow authoring docs keep parity with full-canvas custom view checkpoints (phase 05 + phase 10)

---

## Phase 01 — Apply validation

- [x] **Code:** `engine-capabilities.ts`, lint in CLI + hub; checkpoint view/dist lint; on_resolve default/cancel lint
- [x] **Spec:** CLI spec `space apply --strict`
- [x] **Bridge:** flow-engine.md — dispatch kinds table
- [x] **Skill:** `flow-authoring.md` — apply warnings
- [x] **Docs:** known-gaps B5 removed (shipped); B1 notes apply warnings
- [x] **Fixture:** `fixtures/space-apply/unsupported-step-kind.json`
- [x] **CI:** `check:doc-tracker` warn-only script added

## Phase 02 — View SDK

- [x] **Code:** `view-sdk/app` — createViewMount, ViewProvider, hooks; npm publish ready
- [x] **CLI:** `space view init`, `view dev` — Vite+React + fixtures
- [x] **Docs:** view-sdk.md author section; skill views.md
- [x] **Gate:** blocks 09 M6 until shipped
- [x] Remove B9 from known-gaps when shipped

## Phase 03 — Engine completion

- [x] **Spec:** §5.2 checkpoint runtime; resolve wire `disposition`+`output`; §5.6 partial removed
- [x] **Bridge:** flow-engine.md, action-invoke.md env table
- [x] **Skill:** flow-authoring.md — checkpoints + `{{steps.*}}` + on_resolve
- [x] **Docs:** environment.md shell_spawn; remove B1–B3 from known-gaps
- [x] **Fixtures:** declarative-gate-chain, step-output-chaining, gate-loop-on-resolve

## Phase 04 — Space flow scaffold

- [x] **CLI spec:** `space flow init` + templates hello-gate / hello-invoke
- [x] **Skill:** space-directory.md
- [x] **Docs:** creating-flows.md; remove B6
- [x] **Fixture:** space-flow-init-hello-gate.json
- [x] **Align:** [06-reference-workflow-preview-review.md](./06-reference-workflow-preview-review.md) tree

## Phase 05 — ViewCanvasHost + checkpoints

- [x] **Spec:** §5.4 checkpoint view — **ViewCanvasHost** (full canvas), not drawer
- [x] **Docs:** view-sdk.md checkpoint context; shell/spec.md ViewCanvasHost; session/title UX
- [x] **Skill:** views.md — custom views primary; remove B4
- [x] **Test:** shell component test for R3 CI minimum

## Phase 06 — Reference workflow (example + R1–R6)

- [x] **Example:** `examples/flows/preview-review-v2/` matches normative manifest
- [x] **Fixtures:** engine loop fixtures linked from acceptance.md
- [x] **Docs:** orchestration A/B in tutorials (phase 10 ships prose)

## Phase 07 — Unified murrmure skill

### 07a (early)

- [x] Rename skill id + install path
- [x] Rewrite SKILL.md router
- [x] **Docs:** agent-skill.md, agents-mcp.md → pointers
- [x] Delete skill FDK reference files (prep for phase 09)

### 07b (rolling)

- [x] Complete reference/*.md inventory per [07-unified-murrmure-skill.md](./07-unified-murrmure-skill.md)
- [x] skill-eval fixtures + ≥5/6 pass — **advisory only, not CI** ([decision 12](./decisions/12-skill-eval-advisory-only.md))
- [x] wizards.md — human vs agent paths

## Phase 08 — CLI wizards

- [x] **CLI spec:** setup, onboard, wizard table
- [x] **Docs:** quick-start rewrite; desktop.md handoff sync
- [x] **Skill:** cli.md, wizards.md
- [x] **Fixture:** wizard-onboard-smoke.json

## Phase 09-pre — FDK test disposition

- [x] [09-pre-fdk-test-disposition.md](./09-pre-fdk-test-disposition.md) table 100% filled

## Phase 09 — FDK deletion

- [x] **Delete** human docs: flow-evolution, flow-dev-kit reference (not tutorials)
- [x] **Rewrite before delete:** flows-tutorial + tutorials/** v2-complete (09-pre P5–P6)
- [x] **Delete** skill: evolution-pipeline, capability-authoring, workers
- [x] **Update:** README, how-it-fits-together, creating-flows, http-api, vitepress nav
- [x] **Update:** deferred.md — remove FDK section
- [x] **Update:** architecture.md — remove flow-kit from diagram
- [x] **Verify:** no `studio-*` packages; hub-daemon canonical ([decision 13](./decisions/13-hub-daemon-canonical-no-studio-duplicates.md))
- [x] CHANGELOG breaking note

## Phase 10 — Docs & proof

- [x] Full human doc checklist + tutorial parity in [10-docs-and-proof.md](./10-docs-and-proof.md)
- [x] **Reference workflow** [06-reference-workflow-preview-review.md](./06-reference-workflow-preview-review.md) — R1–R6 labeled CI/manual/backlog
- [x] **10-T1–T4** (+ 10-T1b) tutorial proofs green (automated layer)
- [x] North-star UX docs consistent view-first terminology
- [x] acceptance.md B1–B8 rows
- [x] CI: known-gaps sync, FDK grep gate, **`check:doc-tracker` strict**
- [x] demo-space murrmure/ in repo + CI apply --strict

---

*End of tracker.*
