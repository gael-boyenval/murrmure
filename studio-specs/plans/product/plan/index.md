# Murrmure v2 — Implementation spec (rev-5)

**Status:** active — **normative implementation spec** (phases 01–10, sequential execution)  
**Date:** 2026-07-03 rev-5 — full rebuild after plan reviews + 14 decisions  
**Prior revisions:** [09-review-synthesis.md](./09-review-synthesis.md) · rev-4 index (superseded)  
**Plan reviews (historical):** [plan-review-1.md](./plan-review-1.md) · [plan-review-2.md](./plan-review-2.md) · [plan-review-3.md](./plan-review-3.md)  
**Decisions (normative addenda):** [decisions/README.md](./decisions/README.md)  
**Product spec:** [current/product/spec.md](../../../current/product/spec.md) §21  
**Deferred (non-goals):** [current/product/deferred.md](../../../current/product/deferred.md)  
**Reference workflow:** [06-reference-workflow-preview-review.md](./06-reference-workflow-preview-review.md)

> This plan **is the spec** for unfinished v2 product surface. Phase docs define schemas, APIs, acceptance criteria, and example trees — not direction-only backlog items.

> **North star:** Custom views in `murrmure/views/` via **ViewCanvasHost** are the human OS. Shell chrome is admin/operator mode. See [philosophy.md § North star](../../../current/product/philosophy.md#north-star-non-negotiable--2026-07-03).

---

## What we are building (one paragraph)

Authors scaffold **`murrmure/`** spaces with **flows + React views + actions**. `mrmr space apply` indexes them. Runs execute declarative steps; **checkpoint steps pause** for humans in **full-screen custom views**. **Review loops** (build → review → feedback → build → … → validated) use **`checkpoint.on_resolve` branching** inside one session/run. **`@murrmure/view-sdk`** (public npm) gives authors `createViewMount` + hooks; **`mrmr view dev`** iterates against fixtures in Desktop. The shell embeds views via **ViewCanvasHost**. Human resolve wire is **`disposition: continue | cancel`** + **`output`**. FDK **install pipeline** is deleted only after the above ships.

---

## Sequential execution order (normative)

Execute phases **in this order**. Do not start a later phase until its **Depends on** rows are green.

| Order | Phase | Spec | Delivers |
|------:|-------|------|----------|
| **01** | Apply validation | [01-apply-validation.md](./01-apply-validation.md) | `ENGINE_DISPATCH_KINDS`, apply lint, checkpoint view/`dist/` lint, doc-tracker warn CI |
| **02** | View SDK | [02-view-sdk.md](./02-view-sdk.md) | `@murrmure/view-sdk/app`, npm publish, `mrmr space view init`, `mrmr view dev`, fixtures |
| **03** | Engine completion | [03-engine-completion.md](./03-engine-completion.md) | Checkpoint dispatch, `disposition`+`output`, `on_resolve`, step outputs, `MURRMURE_INPUT` |
| **04** | Space flow scaffold | [04-space-flow-scaffold.md](./04-space-flow-scaffold.md) | `mrmr space flow init`, hello-gate/hello-invoke templates |
| **05** | ViewCanvasHost | [05-view-canvas-checkpoints.md](./05-view-canvas-checkpoints.md) | Checkpoint-only human UI, shell adapter, full primary region |
| **06** | Reference workflow | [06-reference-workflow-preview-review.md](./06-reference-workflow-preview-review.md) | `preview-review-v2` example, R1–R6 layered verification, orchestration A/B |
| **07** | Unified skill | [07-unified-murrmure-skill.md](./07-unified-murrmure-skill.md) | `murrmure` skill sole agent source (04a early, 04b rolling) |
| **08** | CLI wizards | [08-cli-setup-wizards.md](./08-cli-setup-wizards.md) | `mrmr setup`, `space onboard`, TTFRun path |
| **09** | FDK deletion | [09-fdk-deletion.md](./09-fdk-deletion.md) | Worker runtime removal; hub-daemon FDK modules excised |
| **10** | Docs & proof | [10-docs-and-proof.md](./10-docs-and-proof.md) | Tutorial parity, acceptance fixtures, strict CI gates |

### Parallel tracks (same PR rules apply)

| Track | When | Rule |
|-------|------|------|
| **07b skill reference** | Rolling from phase 03 onward | Update skill `reference/*.md` in same PR as the phase it documents ([00-doc-skill-mcp-tracker.md](./00-doc-skill-mcp-tracker.md)) |
| **09-pre test inventory** | Before phase 09 merge | [09-pre-fdk-test-disposition.md](./09-pre-fdk-test-disposition.md) 100% filled ([decision 11](./decisions/11-fdk-test-disposition-inventory.md)) |
| **Acceptance fixtures** | From phase 03 onward | Add golden fixtures as phases ship; phase 10 consolidates |

### Hard gates

| Gate | Rule |
|------|------|
| **02 before 09 M6** | Do not delete `flow-dev-kit` until `@murrmure/view-sdk/app` ships |
| **03 + 05 before 06 proof** | Review loop E2E needs engine + ViewCanvasHost |
| **05 before 10-T1** | Tutorial 1 requires full canvas, not drawer |
| **09-pre before 09** | Per-test disposition table complete; security rows ported or documented |
| **07a before 09** | Skill has zero FDK push/evolution references |

---

## Layer model (normative)

| Layer | Package / artifact | Role |
|-------|-------------------|------|
| **Protocol** | `hub-core`, hub HTTP | Session, run, checkpoint/gate, journal, apply index |
| **Flow** | `murrmure/flows/*/flow.manifest.yaml` | Step graph: `triggers`, `invoke`, `checkpoint`, `start_flow` |
| **View** | `murrmure/views/*` + `@murrmure/view-sdk/app` | React UI at checkpoint steps only |
| **Shell** | `shell-web` + `@murrmure/view-sdk` (host) | ViewCanvasHost, resolve adapter, admin chrome |
| **CLI** | `@murrmure/cli` | scaffold, apply, setup, view dev |

**Retire:** FDK worker install, `@murrmure/flow-kit` **after** port to view-sdk (phase 02).

**Canonical hub package:** `packages/hub-daemon/` — excise FDK modules inside; do **not** delete the package ([decision 13](./decisions/13-hub-daemon-canonical-no-studio-duplicates.md)).

---

## Glossary (v2 normative)

| Term | Meaning |
|------|---------|
| **Checkpoint** | Flow step kind (`steps[].checkpoint`) — only human UI path; compiles to IR kind `checkpoint` (legacy alias `gate`) |
| **Triggers** | Top-level `triggers:` — **when** a run may start; **no views** ([decision 05](./decisions/05-triggers-only-checkpoint-steps.md)) |
| **Resolve wire** | `POST …/gates/{id}/resolve` body: `{ disposition: continue \| cancel, output? }` ([decision 04](./decisions/04-human-checkpoint-resolve-wire.md)) |
| **output** | Step result bag → `exec_context.steps[step_id].output`; replaces author-facing `resume_data` |
| **on_resolve** | Required `default` + `cancel`; optional `when`/`values` branching ([decision 06](./decisions/06-checkpoint-on-resolve-explicit.md)) |
| **responseSchema** | View context hint under `gate.responseSchema` — **not** `form_schema` ([decision 03](./decisions/03-gate-view-context-shape.md)) |
| **ViewCanvasHost** | Shell component filling primary region for checkpoint views |
| **Session** | Human-facing correlation (`ses_*`, title) — journal, notifications, Desktop route ([decision 07](./decisions/07-session-vs-run-user-facing.md)) |
| **Run** | Operator/debug (`run_*`) — one execution of the flow graph |

**Removed (breaking OK):** `start.requires_view`, view `mode: "start"`, approval-centric resolve vocabulary at protocol edge.

---

## Gap mapping

| ID | Symptom | Phase |
|----|---------|-------|
| B1 | Checkpoint/gate steps don't run | **03** |
| B2 | Step outputs empty (`{{steps.*}}`) | **03** |
| B3 | `MURRMURE_INPUT` missing on shell_spawn | **03** |
| B4 | No full canvas at checkpoints | **05** |
| B5 | Apply doesn't lint capabilities | **01** |
| B6 | No `space flow init` | **04** |
| B7 | Skill fragmented (`murrmure-flow`) | **07** |
| B8 | No setup wizard | **08** |
| B9 | No view author SDK (stub HTML only) | **02** |
| B10 | No multi-round review loop in v2 | **03** + **06** |

---

## Decisions index (all resolved 2026-07-03)

| # | Topic | Phase impact |
|---|-------|--------------|
| [01](./decisions/01-view-sdk-npm-distribution.md) | Public npm `@murrmure/view-sdk` | 02 |
| [02](./decisions/02-view-dev-loop.md) | `mrmr view dev`, fixtures, author-owned build | 02, 05 |
| [03](./decisions/03-gate-view-context-shape.md) | Nested `gate`, `responseSchema` | 02, 05 |
| [04](./decisions/04-human-checkpoint-resolve-wire.md) | `disposition`+`output`, orchestration A/B | 03, 05, 06, 10 |
| [05](./decisions/05-triggers-only-checkpoint-steps.md) | `triggers:` only, checkpoint steps, input merge | 01, 03, 04, 05, 06 |
| [06](./decisions/06-checkpoint-on-resolve-explicit.md) | Required `default`+`cancel` | 01, 03 |
| [07](./decisions/07-session-vs-run-user-facing.md) | Session/title for humans | 05, 10 |
| [08](./decisions/08-payload-ref-from-step-output.md) | Optional `payload_ref` from step output | 03, 05, 06 |
| [09](./decisions/09-cli-scaffold-space-scoped.md) | `space flow init`, `space view init` | 02, 04 |
| [10](./decisions/10-reference-workflow-verification-layered.md) | R1–R6 CI/manual/backlog | 06, 10 |
| [11](./decisions/11-fdk-test-disposition-inventory.md) | Per-test port/delete table | 09-pre, 09 |
| [12](./decisions/12-skill-eval-advisory-only.md) | Skill eval manual, not CI | 07 |
| [13](./decisions/13-hub-daemon-canonical-no-studio-duplicates.md) | Keep `hub-daemon`; verify no `studio-*` | 09 |
| [14](./decisions/14-doc-tracker-warn-from-phase-01.md) | Doc tracker warn CI from phase 01 | 01, 10 |

---

## Success metrics

1. **Preview-review E2E** — [06](./06-reference-workflow-preview-review.md) R1–R6 labeled CI/manual/backlog; CI layer green before v2 done
2. **View author path** — `mrmr space view init` → `mrmr view dev` → `npm run build` → apply → checkpoint view renders with `createViewMount`
3. **ViewCanvasHost** — all checkpoint steps with `view` use full main region
4. **TTFRun ≤ 10 min** — `mrmr setup` → Run → checkpoint UI (session/title in chrome)
5. **Zero FDK install** — after phase 09; tutorials v2-only
6. **Apply strict clean** — all `examples/flows/*-v2/` pass `--strict`

---

## Already built (out of scope for phases)

Space apply, sessions/runs, gates API, flow engine invoke/start_flow, hooks, federation. Legacy `start.requires_view` exists in code but is **wrong host** (drawer) and **removed from v2 manifest** ([decision 05](./decisions/05-triggers-only-checkpoint-steps.md)).

---

## Cross-cutting rules

| Requirement | Where |
|-------------|-------|
| [00-doc-skill-mcp-tracker](./00-doc-skill-mcp-tracker.md) | Same PR as code; warn CI from phase 01; strict at phase 10 |
| known-gaps B1–B10 | Close in same PR as phase |
| [06-reference-workflow](./06-reference-workflow-preview-review.md) | Update if checkpoint/view/resolve API changes |
| North star | [.cursor/rules/murrmure-product-north-star.mdc](../../../../.cursor/rules/murrmure-product-north-star.mdc) |

---

## File map (rev-5)

| File | Notes |
|------|-------|
| `01`–`10` | Sequential phase specs (this rebuild) |
| `00-doc-skill-mcp-tracker.md` | Living checklist |
| `09-pre-fdk-test-disposition.md` | Required before phase 09 |
| `decisions/` | Resolved Q&A — do not re-litigate |
| `09-review-synthesis.md` | Pre-rev-5 synthesis |
| `plan-review-*.md` | Subagent reviews — historical |

**Superseded filenames (removed in rev-5):** `03b-view-sdk.md`, old `02-engine-completion.md`, `03-space-flow-scaffold.md`, `04-unified-murrmure-skill.md`, `05-cli-setup-wizards.md`, `06-gate-requires-view.md`, `07-legacy-fdk-deletion.md`, `08-docs-and-proof.md`, `10-reference-workflow-preview-review.md` — content merged into sequential `01`–`10`.

---

*End of spec index.*
