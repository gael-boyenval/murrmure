# Phase 10 — Docs rewrite + proof layer

**Status:** ✅ complete  
**Execution order:** **10 / 10**  
**Depends on:** phases 01–09 (closes backlog); **starts early** for P2 acceptance rewrites (09-pre)  
**Decisions:** [10 verification layered](./decisions/10-reference-workflow-verification-layered.md) · [14 doc tracker strict](./decisions/14-doc-tracker-warn-from-phase-01.md)  
**Owns:** human documentation structure, acceptance fixtures, CI honesty gates

---

## Problem

Human docs duplicate agent guidance, reference deleted FDK paths, and drift from skill. Acceptance criteria are smoke-level with no golden fixtures. Tracker rules are not CI-enforced. B-ID labels in known-gaps (symptoms) differ from phase numbers (deliverables).

## Outcome

1. **Clear doc roles** — who reads what
2. **Golden proof** — fixtures + user tests for every gap
3. **CI guardrails** — gaps sync, no FDK resurrection, spec §21 matches plan; **`check:doc-tracker` strict** (warn-only since phase 01)
4. **Tutorial parity** — every hands-on walkthrough works on shipped Desktop + CLI; **no capability regression** vs pre-v2 tutorials

---

## Tutorial parity (no capability gap)

**Policy:** Do **not** delete tutorials. **Rewrite** them to v2 (`murrmure/` + `mrmr space apply`). A user who completes the full backlog must achieve **the same coordination outcomes** as today's FDK tutorials — on end-user Desktop, not contributor test helpers.

### Parity matrix

| Track | Pages | User outcome (unchanged) | v2 mechanism | Example tree | Phases |
|-------|-------|--------------------------|--------------|--------------|--------|
| **Flows tutorial** | [flows-tutorial.md](../../../../apps/docs/guide/flows-tutorial.md) | Author a complete workflow from scratch | `murrmure/actions.yaml`, `flows/*/flow.manifest.yaml`, optional `views/`, `hooks.yaml`, `mrmr space apply` | `examples/flows/hello-authoring/` | 01, 04 |
| **Tutorial 1** | [01-local-preview-review/](../../../../apps/docs/guide/tutorials/01-local-preview-review/) (3 parts) | Agent + human review loop on localhost preview until validated | Spec: [06-reference-workflow-preview-review.md](./06-reference-workflow-preview-review.md) | `examples/flows/preview-review-v2/` | 03, 02, 04, **05** |
| **Tutorial 1b** | Same tutorial track §B | Agent-owned loop via `wait_for_gate` | [decision 04](./decisions/04-human-checkpoint-resolve-wire.md) Pattern B | same example | 03, 05, 07 |
| **Tutorial 2** | [02-multi-agent-brief/](../../../../apps/docs/guide/tutorials/02-multi-agent-brief/) (5 parts) | Three spaces, orchestrator brief, cross-space fetch, publish + trigger wake | Three linked `murrmure/` trees + federation/cross-space invoke + `hooks.yaml` wake | `examples/flows/team-brief-v2/` | 03, 04, 08 |
| **Tutorial 3** | [03-daily-brief-trigger/](../../../../apps/docs/guide/tutorials/03-daily-brief-trigger/) (4 parts) | Canvas action → event → agent wake → formatted output → human review | **`checkpoint.view`** canvas + hooks + indexed actions | `examples/flows/daily-brief-v2/` | 03, 04, **05** |

**Phase 05 is required** for tutorial parity — no tutorial ships with drawer-only or built-in-form checkpoints as primary UX.

### FDK → v2 mapping (docs must state explicitly)

| Old (FDK) | New (v2) |
|-----------|----------|
| `mrmr flow init` + npm worker package | `mrmr space flow init` + `murrmure/` tree |
| `mrmr flow push` / evolution promote | `mrmr space apply` (+ `--strict`) |
| Worker MCP mount tools | Indexed actions + `murrmure_invoke_action` / shell hub clients |
| FDK `mount.tsx` canvas iframe | **`ViewCanvasHost`** + `@murrmure/view-sdk/app` (`createViewMount`) |
| `contract.json` state machine | `flow.manifest.yaml` + **`checkpoint.on_resolve`** branching (phase 03) |
| Trigger register CLI | `murrmure/hooks.yaml` + apply |
| `start.requires_view` | Step 0 **`checkpoint`** step |
| Approve/reject resolve | `disposition: continue \| cancel` + `output` |

### Tutorial rewrite checklist

- [ ] [tutorials/index.md](../../../../apps/docs/guide/tutorials/index.md) — v2 prerequisites (`mrmr setup`, no flow-kit)
- [ ] [flows-tutorial.md](../../../../apps/docs/guide/flows-tutorial.md) — full v2 authoring reference
- [ ] **Tutorial 1a** — all 3 parts: scaffold via `space flow init`, apply, run loop (flow-owned)
- [ ] **Tutorial 1b** — agent-owned loop section with `wait_for_gate`
- [ ] **Tutorial 2** — all 5 parts: three-space setup, cross-space, hooks wake
- [ ] **Tutorial 3** — all 4 parts: hooks + agent wake + review checkpoint
- [ ] [multi-agent-feature-spec.md](../../../../apps/docs/guide/multi-agent-feature-spec.md) — align with Tutorial 2 v2
- [ ] [review-workflow.md](../../../../apps/docs/guide/review-workflow.md) — align with Tutorial 1 v2; session/title UX
- [ ] Each tutorial links to its `examples/flows/*-v2/` tree; CI applies each with `--strict`

### Tutorial proof (10-T*)

| ID | Script | Pass |
|----|--------|------|
| 10-T1 | Non-contributor completes Tutorial 1a on Desktop | Preview review loop reaches terminal checkpoint without FDK commands |
| 10-T1b | Non-contributor completes Tutorial 1b (agent-owned) | Same session/run; agent `wait_for_gate` loop documented |
| 10-T2 | Non-contributor completes Tutorial 2 | Three spaces, trigger wake, cross-space query |
| 10-T3 | Non-contributor completes Tutorial 3 | Event → wake → output → human review |
| 10-T4 | `pnpm docs:build` + tutorial link crawl | All 16 tutorial pages resolve; zero FDK install steps |

---

## Documentation architecture (finished product)

| Audience | Primary source | Secondary |
|----------|----------------|-----------|
| **Human — first run** | [quick-start.md](../../../../apps/docs/guide/quick-start.md) → `mrmr setup` | [installation.md](../../../../apps/docs/guide/installation.md), [desktop.md](../../../../apps/docs/guide/desktop.md) |
| **Human — hands-on** | [tutorials/](../../../../apps/docs/guide/tutorials/) + [flows-tutorial.md](../../../../apps/docs/guide/flows-tutorial.md) | [creating-flows.md](../../../../apps/docs/guide/creating-flows.md) |
| **Human — philosophy** | [introduction.md](../../../../apps/docs/guide/introduction.md), [how-it-fits-together.md](../../../../apps/docs/guide/how-it-fits-together.md) | [philosophy.md](../../../current/product/philosophy.md) |
| **Agent** | Installed **`murrmure`** skill only | — |
| **Operator reference** | [cli.md](../../../../apps/docs/guide/cli.md), [http-api.md](../../../../apps/docs/reference/http-api.md) | [environment.md](../../../../apps/docs/reference/environment.md), [mcp-tools.md](../../../../apps/docs/reference/mcp-tools.md) |
| **Known limitations** | [known-gaps.md](../../../../apps/docs/guide/known-gaps.md) until empty | skill `known-gaps.md` (synced) |

> **North star for docs:** the human-facing OS shell is the **custom view** (`murrmure/views/` rendered in **ViewCanvasHost**), documented in [view-sdk.md](../../../../apps/docs/reference/view-sdk.md) / [shell-routes.md](../../../../apps/docs/guide/shell-routes.md). Generic **shell chrome** is **operator/admin mode**.

### Human docs to rewrite (checklist)

- [ ] [installation.md](../../../../apps/docs/guide/installation.md) — Desktop + CLI + skill install; no FDK npm packages
- [ ] [quick-start.md](../../../../apps/docs/guide/quick-start.md) — 3-step path; remove FDK callouts
- [ ] [creating-flows.md](../../../../apps/docs/guide/creating-flows.md) — space directory only; `space flow init`; points to tutorials
- [ ] [space-index.md](../../../../apps/docs/guide/space-index.md) — indexed flows only
- [ ] Tutorial parity section above — all **10-T*** proofs green
- [ ] [troubleshooting.md](../../../../apps/docs/guide/troubleshooting.md) — denial code → fix command table (sync skill)
- [ ] [agents-mcp.md](../../../../apps/docs/guide/agents-mcp.md) — ≤20 lines + skill install pointer
- [ ] [agent-skill.md](../../../../apps/docs/guide/agent-skill.md) — install/verify only
- [ ] [cli.md](../../../../apps/docs/guide/cli.md) — remove deleted flow subcommands; add setup/onboard
- [ ] [review-workflow.md](../../../../apps/docs/guide/review-workflow.md) — v2 indexed flow demo
- [ ] [shell-routes.md](../../../../apps/docs/guide/shell-routes.md) — remove FDK canvas sections
- [ ] [configuration.md](../../../../apps/docs/guide/configuration.md) — triggers via hooks.yaml + apply
- [ ] [multi-agent-feature-spec.md](../../../../apps/docs/guide/multi-agent-feature-spec.md) — v2 rewrite
- [ ] [reference/agent-skill.md](../../../../apps/docs/reference/agent-skill.md) — delete or shrink to install pointer
- [ ] [how-it-fits-together.md](../../../../apps/docs/guide/how-it-fits-together.md) — v2 components only
- [ ] [desktop.md](../../../../apps/docs/guide/desktop.md) — `/spaces/new` copy matches `mrmr setup` outro
- [ ] [reference/environment.md](../../../../apps/docs/reference/environment.md) — `MURRMURE_INPUT` after phase 03
- [ ] [reference/mcp-tools.md](../../../../apps/docs/reference/mcp-tools.md) — remove FDK mount tools
- [ ] [README.md](../../../../README.md) — v2-only product story

### VitePress nav / tutorial tree

- [ ] [apps/docs/.vitepress/config.ts](../../../../apps/docs/.vitepress/config.ts):
  - Remove nav: `flow-dev-kit`, `flow-evolution`
  - **Keep** Tutorials sidebar group — all entries point to rewritten v2 pages
  - **Keep** [flows-tutorial.md](../../../../apps/docs/guide/flows-tutorial.md) in nav
  - Remove **Workflows (reference)** FDK-only entries
  - Reorder Getting started: quick-start before installation
  - Add: `space-index`, updated `creating-flows`
- [ ] Add redirects for deleted pages
- [ ] `pnpm docs:build` — zero broken internal links

### Specs & bridges (normative)

- [ ] [current/product/spec.md](../../../current/product/spec.md) §21 — phase table matches [index.md](./index.md); all ✅ when shipped
- [ ] [current/acceptance.md](../../../current/acceptance.md) — fixture rows for phases 01–10
- [ ] [current/cli/spec.md](../../../current/cli/spec.md) — no deleted commands
- [ ] [current/product/architecture.md](../../../current/product/architecture.md) — remove flow-dev-kit from diagram
- [ ] [00-doc-skill-mcp-tracker.md](./00-doc-skill-mcp-tracker.md) — final pass all checked; **`check:doc-tracker` strict in CI**

---

## Proof layer

### Golden fixtures (`studio-specs/current/fixtures/`)

| Fixture | Phase |
|---------|-------|
| `space-apply/unsupported-step-kind.json` | 01 |
| `space-apply/checkpoint-on-resolve-missing.json` | 01 |
| `flow-engine/declarative-gate-chain.json` | 03 |
| `flow-engine/step-output-chaining.json` | 03 |
| `flow-engine/gate-loop-on-resolve.json` | 03 |
| `flow-engine/murrmure-input-env.json` | 03 |
| `cli/space-flow-init-tree.json` | 04 |
| `cli/wizard-onboard-smoke.json` | 08 |
| `flow-engine/gate-requires-view.json` | 05 |
| `demo-space/murrmure/` (full linked tree) | 10 |
| `examples/flows/preview-review-v2/` | 10 (Tutorial 1) |
| `examples/flows/team-brief-v2/` | 10 (Tutorial 2) |
| `examples/flows/daily-brief-v2/` | 10 (Tutorial 3) |
| `examples/flows/hello-authoring/` | 10 (flows-tutorial) |

### CI checks (add scripts)

- [ ] `known-gaps.md` human ↔ skill diff must be empty (or single generated file)
- [ ] `rg` gate: no FDK terms in full `apps/docs/` (not just `guide/`)
- [ ] `spec §21` status matches plan index (script or manual review each release)
- [ ] `pnpm test:acceptance` includes phase fixtures
- [ ] VitePress link check in CI
- [ ] **`check:doc-tracker` — strict (exit 1 on drift)** from this phase ([decision 14](./decisions/14-doc-tracker-warn-from-phase-01.md))
- [ ] R1–R6 rows labeled CI/manual/backlog per [06](./06-reference-workflow-preview-review.md)

### User proof rubrics (10-U*)

| ID | Script | Pass |
|----|--------|------|
| 10-U1 | Fresh clone → `pnpm docs:build` | Zero broken links |
| 10-U2 | Human reads quick-start only → completes TTFRun | ≤10 min to Desktop Run |
| 10-U3 | Agent skill-only → indexes flow without repo grep | Uses `space apply`, not push |
| 10-U4 | `known-gaps.md` human vs skill | Byte-identical or CI-generated |
| 10-U5 | `mrmr space apply --strict` on demo space in CI | Green |
| 10-U6 | Contributor grep for FDK strings in product paths | Zero hits |

**TTFRun rubric:** persona = fresh macOS, Node 20+, packaged Desktop; start = Desktop first open; steps = `mrmr setup` (or `--yes` in CI); stop = first successful Run on indexed flow; fail if any `flow push`, flow-kit install, or contributor-only command appears. MVP docs ≤20 min (08-U1a); full path ≤10 min (08-U1b / 10-U2).

### ENGINE_DISPATCH_KINDS vs manifest

Print `ENGINE_DISPATCH_KINDS` vs step kinds in linked `murrmure/flows/` (docs appendix).

---

## Definition of done

- [ ] All human doc checklist items merged
- [ ] B1–B6 removed from both known-gaps files when phases ship
- [ ] `current/acceptance.md` lists all fixtures with vitest paths
- [ ] CI honesty scripts in `package.json` or `.github/workflows`
- [ ] VitePress site builds with no broken links to deleted pages
- [ ] **10-T4** tutorial link crawl + example apply — all strict-clean
- [ ] R1–R6 CI layer green; manual 10-T1/10-T1b on release checklist

### Success

Plan index: all phases ✅. TTFRun ≤ 10 min. Agent eval ≥ 5/6 (advisory). Zero FDK grep hits. **10-T1–T4 green** (tutorial parity).

---

*End of phase 10.*
