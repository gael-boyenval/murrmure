# Plan Review 1 — Semantics, Boundaries & Open Questions

**Reviewer:** Agent 1 (semantics focus)
**Date:** 2026-07-03
**Plan revision reviewed:** rev-4 (index.md)

---

## Executive summary

The rev-4 plan is conceptually strong and unusually well-aligned with the product
north star: the layer model (Protocol / Flow / View / Shell / CLI) is explicit, the
"custom views are the product" thesis is repeated consistently, and the FDK-deletion
policy is unambiguous. The **big-picture concepts** (session, run, gate, space directory,
apply, view-sdk vs flow-kit) are clear and mostly descriptive for end users.

The weaknesses are in the **seams**, not the vision. Three classes of problem recur:
(1) **command taxonomy is inconsistent** — `mrmr space flow init` vs `mrmr view init`
vs the kept-but-renamed `mrmr flow status`, with an awkward `03b` phase that actually
builds *before* `03`; (2) **the gate submit → resolve → step-output data path is
underspecified** — `outcome`, `resume_data`, `comments`, and `form_values` are used
across four docs with no single normative mapping, and the gate view context shape is
defined twice (03b `ViewAppContext` vs 06 `ViewHostContext`) with divergent field
placement; (3) **the plan's own bookkeeping has drifted from the code and spec it
governs** — spec §21 still calls phase 06 "optional," the two `known-gaps.md` files
already disagree (the thing 08-U4 promises to enforce), and B7/B8 appear in the gap map
but in neither symptom doc.

None of these block execution of phases 01–02, but they should be resolved before 03b/06
ship, because they define the author-facing DX surface (view SDK + scaffold + gate loop)
that the whole product rests on. I also flag one **real gap the plan does not mention at
all: the view author dev loop** (edit → rebuild → reapply → reload). Given active
desktop HMR work in the tree, the absence of a `view dev`/watch story is a notable DX hole.

---

## Scorecard

| Criterion | Score | Notes |
|-----------|-------|-------|
| **1 — Concepts, names, tool semantics, boundaries** | **3.5 / 5** | Layer model + north-star framing are excellent. Loses points for inconsistent command taxonomy, dual definition of gate view context, undefined `resume_data` mapping, and `view_ref`/`requires_view` dualism not documented as a pair. |
| **7 — Open questions** | **3 / 5** | Several structural DX decisions are silently assumed rather than asked: npm distribution of view-sdk (Q2 "open" but scaffold pins `workspace:*`), no view dev/HMR loop, build-before-apply has no guard, `on_resolve.rejected absent → fail run` default is asserted not questioned. |
| 2 — Architecture (KISS/YAGNI/DRY) | Good | Single `ENGINE_DISPATCH_KINDS`, single `@murrmure/view-sdk`, single space package model. Minor DRY smell: `outcome` vs `decision` (two approval fields); `ViewHostContext` shape restated in two phase docs. |
| 3 — Test/build/lint per phase | Good | Every phase has a DoD with unit tests + golden fixtures + user-proof rubrics. Gap: no explicit typecheck/lint gate for the **scaffolded view TS**, and no CI build of the Vite template. |
| 4 — Deprecated/deferred leakage | Needs work | spec §21 marks 06 "optional" (contradicts rev-3/4); §5.6 links to renamed plan files; `SKILL.md` still says "FDK worker packages remain optional"; `studio-*` duplicate packages + FDK example trees still present. |
| 5 — Desktop live reload | Not addressed | Plan has no view dev-loop / HMR / hot-reapply story. See open question Q-A. |
| 6 — Conceptual alignment | Strong | Plan, philosophy.md, tracker, and deferred.md all speak the same north-star language. |

---

## Concepts & naming audit

| Term | Plan meaning | Code reality | Clarity | Recommendation |
|------|--------------|--------------|---------|----------------|
| `murrmure` skill | Sole agent source; renamed from `murrmure-flow` (04a) | `SKILL_DIR_NAME = "murrmure-flow"`; `SKILL.md` frontmatter `name: murrmure-flow`; still says "FDK worker packages remain optional" | Clear intent, stale code | Keep rename; add 04a task to strip the "FDK optional" sentence (currently contradicts 07). |
| `@murrmure/view-sdk/app` | New author subpath: `createViewMount`, `ViewProvider`, hooks (03b) | `package.json` exports only `.` and `./host`; no `./app` | Clear, unbuilt | OK — this is the point of 03b. Ensure `./app` is React-only and `.`/`./host` stay shell-only (peer-dep boundary). |
| `ViewCanvasHost` | Shell component; primary full-region gate/start host (06) | Does **not** exist; `ViewDrawer`, `GateResolvePanel`, `GatePanel`, `ViewParamForm` exist | Clear, unbuilt | OK. Name is good and descriptive. |
| `ViewHostContext` | 06 redefines it with `mode`, `steps`, `input`, `payload_ref`, `step_id` | Current type: `{flow_id, space_id, hub_base_url, token, session_id?, run_id?, gate_id?}` — no `mode`/`steps`/`input` | **Ambiguous** | See boundary analysis: reconcile with 03b `ViewAppContext`. One shape, one owner. |
| `ViewAppContext` | 03b: extends `ViewHostContext`, adds `mode`, nested `gate{gate_id,step_id,payload_ref,form_schema}`, `steps`, `input` | n/a (new) | **Conflicts with 06** | 06 puts `gate_id/step_id/payload_ref` *flat*; 03b nests them under `gate`. Pick one. |
| `requires_view` (manifest) vs `view_ref` (IR/index) | Author writes `requires_view`; apply denormalizes to `view_ref` | `FlowGateStepSchema` has neither yet (`{form, assignees}` only) | Two names, one concept — undocumented pairing | Document the pair once (author term vs indexed term). Fine to keep both. |
| `gate.on_resolve.{approved,rejected}.goto` | Branch/loop-back target step id (02) | Not in schema; runtime is invoke/start_flow only | Clear | Good name. Define the "absent rejected" default in the schema doc, not just a lint. |
| `outcome` (`validated` / `changes_required`) | Semantic layer on top of `decision` (03b/10) | Gate resolve command accepts `{decision, resume_data}` only | **Redundant / unclear** | Decide: is `outcome` protocol, or just a `form_values`/`resume_data` convention? Don't invent a second approval axis at the protocol edge. |
| `resume_data` | "merged into exec_context on reject" (02/06) | Real field: `GateResolve` = `{decision, resume_data?: record}` | Underspecified transform | Specify exactly how view submit `{comments, form_values, outcome}` maps into `resume_data` and then into `steps.<id>.output`. |
| `mrmr space flow init` | Scaffold flow+view+script (03) | Not implemented; `mrmr flow init` = FDK scaffold (delete 07) | Clear but taxonomically odd | See boundary analysis — inconsistent with `mrmr view init`. |
| `mrmr view init` / `view build` | Scaffold Vite+React tree; optional build (03b) | `view init` exists but scaffolds stub `dist/index.html` (`scaffoldViewPackage`) | Clear, needs rewrite | OK. Add a `view dev` (watch) — see Q-A. |
| `start` "checkpoint" vs `gate` | Both open a view; distinguished by `mode` | `start.requires_view` exists (opens `ViewDrawer` — wrong host) | Mostly clear | Keep. Ensure "checkpoint" is defined once as the umbrella for start+gate view mounts. |
| `hello-gate` / `hello-invoke` templates | Scaffold templates (03) | Templates dir has FDK `review-loop`, `feature-spec` only | Clear, unbuilt | OK. |
| Example tree `preview-review-v2` (+ `team-brief-v2`, `daily-brief-v2`, `hello-authoring`) | Referenced as fixtures/tutorial trees (08, 10) | Only `examples/flows/orchestrator-with-review/` exists | Clear, unbuilt | Fine as targets; just note none exist yet so 07-pre P1 is fully greenfield. |

---

## Boundary analysis (protocol / flow / view / shell / CLI)

The layer model in `index.md` is the plan's strongest asset. Boundaries hold well in the
large. The leaks are all at the **view↔shell↔protocol gate-resolve seam**:

1. **Gate view context is defined in two places with two shapes (leak: View ↔ Shell).**
   - 03b `ViewAppContext` nests gate fields: `gate: { gate_id, step_id, payload_ref, form_schema }`.
   - 06 `ViewHostContext` flattens them: `gate_id?, step_id?, payload_ref?` at top level, plus `mode/steps/input`.
   - The shipped `ViewHostContext` (view-sdk/src/types.ts) has none of these.
   - **Fix:** define **one** context type in `@murrmure/view-sdk` (host base), have the app SDK
     re-export or narrow it. Decide flat vs nested *once*. 03b and 06 must reference the same type,
     not each redeclare it.

2. **Submit payload → gate resolve → step output is a three-hop transform with no single spec (leak: View → Protocol).**
   - View submits `{decision, outcome?, comments?, form_values?}` (03b).
   - Protocol accepts `{decision, resume_data?}` (contracts).
   - Phase 02 stores `steps[id].output = {decision, outcome, comments, form_values, resolved_at, resolved_by}`.
   - Nowhere is it stated how `outcome/comments/form_values` collapse into the opaque
     `resume_data`, nor how they re-expand into structured `steps.<id>.output`. Authors writing
     `{{steps.review.output.comments}}` (as the reference workflow does) depend on this mapping.
   - **Fix:** add a normative "gate resolve wire mapping" block (probably in 02 or 03b) — one table:
     view field → `resume_data` key → `steps.<id>.output` path.

3. **`outcome` blurs the Protocol/View boundary (leak: View semantics leaking toward Protocol).**
   The protocol only knows `approved|rejected`. `outcome: validated|changes_required` is a
   view/flow convention. The plan sometimes treats it as protocol-ish ("semantic for agent/flow").
   Either promote it to protocol (schema it) or demote it to just another `form_values`/`resume_data`
   key. Right now it floats between layers.

4. **CLI command taxonomy is internally inconsistent (leak: CLI surface shape).**
   - Flows scaffold under a **nested** verb: `mrmr space flow init`.
   - Views scaffold at **top level**: `mrmr view init` (not `mrmr space view init`).
   - The kept flow command is `mrmr flow status`, while `mrmr flow init` is deleted and
     redirects to `mrmr space flow init`.
   So `flow` lives at two levels (`mrmr flow status` kept, `mrmr flow init` gone → `mrmr space flow init`).
   This will confuse authors and agents. **Fix:** pick one home for authoring scaffolds. Either
   `mrmr space flow init` + `mrmr space view init` (consistent nesting) or `mrmr flow init` +
   `mrmr view init` (consistent top-level, with the space inferred from `murrmure/` root). The
   redirect guard in 03 is a band-aid over the inconsistency.

5. **Phase numbering leaks build order (leak: plan structure).**
   `03b` is declared as a dependency of `03` ("Depends on: 03b") and the build order is
   `… 03b → 03 …`. A sub-lettered phase that must ship *before* its parent inverts the
   reader's expectation. **Fix:** renumber so ordinal = build order (make view-sdk `03`,
   scaffold `04`, shift the rest), or explicitly relabel as "03a view-sdk → 03b scaffold."

Where boundaries are **clean and should be kept:** apply (index) vs scaffold (init);
flow (declarative graph) vs view (presentation); orchestration-attach vs file-backed flow
as the two authoring surfaces; shell = observer/admin vs CLI = mutator. These are crisp.

---

## Terminology conflicts & deprecated leakage

1. **spec §21 vs plan rev-4 — phase 06 status conflict.** spec.md §21 lists
   "06 | `gate.requires_view` *(optional; closes B4)*". The plan (rev-3/4, 09-review §1a,
   tracker) makes 06 **required** and the north-star centerpiece. spec §6.2 *also* already
   calls the view the "primary UX" — so the spec contradicts itself. **Action:** phase 06/08
   must flip §21 to "required" and drop "(optional)". This is exactly the kind of deprecated
   framing the plan says it wants gone.

2. **spec §5.6 links to renamed plan files.** It points to `plan/01-flow-engine-gate-steps.md`
   and `plan/02-flow-engine-step-outputs.md`, which no longer exist (renumbered to
   `01-apply-validation` / `02-engine-completion`). Broken normative links today.

3. **spec §21 omits 03b and 10.** The phase table has 01–08 but not 03b (view SDK) or
   10 (reference workflow), both of which the plan calls normative/blocking. spec is stale
   relative to index.md rev-4.

4. **`SKILL.md` still says "FDK worker packages remain optional for bundled capabilities."**
   Directly contradicts phase 07's full-deletion policy and 04a's "delete FDK refs." Skill
   frontmatter also still `name: murrmure-flow`.

5. **known-gaps drift — the sync the plan promises is already broken.** Human
   `apps/docs/guide/known-gaps.md` lists **B1–B6**. Skill
   `packages/cli/skill/reference/known-gaps.md` lists **B1–B6 + B9 + B10** (no B7/B8).
   08-U4 asserts these must be "byte-identical / CI-generated," yet they diverge now, and the
   symptom set itself differs. **Action:** reconcile before claiming the CI gate is meetable.

6. **B7/B8 are phantom IDs.** `index.md` gap mapping lists B7 (skill fragmented → 04) and
   B8 (no setup wizard → 05), but neither `known-gaps.md` defines B7 or B8. The gap map invents
   symptom IDs that don't exist in the symptom docs. Either add B7/B8 to known-gaps or stop
   referencing them as symptom IDs.

7. **Deferred/duplicate code still in tree (informational, 07 targets):** `studio-hub-daemon`,
   `studio-hub-core`, `studio-hub-persistence`, `studio-contracts`, `studio-executors`
   duplicates exist; FDK example `orchestrator-with-review` and CLI templates
   `flows/review-loop` + `flows/feature-spec` still present. Plan 07 accounts for these, but
   note the review-loop/feature-spec templates are FDK contract-based and must not be the
   scaffold source for 03.

---

## Assumptions that should be questions

1. **View-sdk distribution (Q2 half-open).** 09-review Q2 marks npm publish "open —
   external authors copy from scaffold." But 03b's scaffold `package.json` "pins
   `@murrmure/view-sdk`" — as `workspace:*` that only resolves inside the monorepo. **Question
   for product owners:** how does a non-contributor author (the explicit TTFRun persona in 08)
   install `@murrmure/view-sdk/app` in their own `murrmure/views/<id>/`? If not published, the
   scaffold cannot `npm install` outside the repo, and 08-T1 ("non-contributor completes
   Tutorial 1") is not achievable as written.

2. **Author dev loop / desktop live reload is unspecified.** 03b assumes `npm run build` →
   `space apply` → reload. There is no `mrmr view dev` (watch), no HMR, no "reapply on change."
   For an iterative UI (the whole point of custom views) this is a heavy loop. **Question:** is
   there a supported view dev-loop for phase 06, or do authors rebuild+reapply+refresh on every
   edit? (The active `dev-hmr` work in `apps/desktop/scripts/` suggests appetite for this —
   should it extend to view bundles?)

3. **Build-before-apply has no guard.** `mrmr space apply` indexes `./dist/index.html`, but
   nothing in 01's lint table checks that a `requires_view` view was actually built. **Question:**
   should apply warn/fail (under `--strict`) when a referenced view has no `dist/`? Today an
   author can apply a gate referencing an unbuilt view and only discover it at gate time.

4. **`on_resolve.rejected absent → fail run` is asserted, not chosen.** 02 documents this as
   "the default." **Question:** is silently failing the run the least-surprising default, or
   should a bare `gate` reject just stop/hold the run? A lint warns, but the default behavior is
   a product decision worth confirming.

5. **`outcome` as a first-class field.** **Question:** do we want a second approval axis
   (`outcome`) distinct from `decision` at all, or is it a `form_values` convention? This
   changes whether it belongs in contracts.

6. **Gate view context shape (flat vs nested).** **Question for owners:** should prior-step
   outputs, run input, and gate identifiers be flat on the context (06) or nested (03b)? This is
   the SDK's public API surface — worth deciding deliberately, not by whichever phase lands first.

7. **Session vs Run in the human's mental model.** The reference workflow correctly separates
   `ses_` (correlation) and `run_` (execution), but tutorials/scaffold copy will expose both to
   users. **Question:** do end users ever need to see "run" as distinct from "session," or is
   "session" the only user-facing noun (run stays an implementation detail in the flowchart)?

8. **`payload_ref` producer.** Context carries `payload_ref` for "large preview metadata," but
   no phase specifies **who writes it** on the gate (engine? invoke step output? shell?).
   Question to close before 06.

---

## Recommended renames / glossary additions

- **Renumber `03b`** → make view-sdk the earlier ordinal so number = build order
  (e.g. `03` view-sdk, `04` scaffold), or relabel `03a`/`03b` with 03a first.
- **Unify scaffold command taxonomy** — choose `mrmr space flow init` + `mrmr space view init`,
  *or* `mrmr flow init` + `mrmr view init`. Don't split levels.
- **Add a glossary block to `index.md`** defining, once: `checkpoint` (start|gate view mount),
  `view_ref` vs `requires_view`, `decision` vs `outcome`, `resume_data`, `ViewCanvasHost` vs
  `ViewDrawer` (fallback), `session` vs `run`. Agents and authors currently reassemble these
  from five documents.
- **Pick one context type name.** Keep `ViewHostContext` as the single host→view payload;
  make `ViewAppContext` a strict alias/extension that adds nothing structural, or drop it.
- **Rename the "fail run" default** to an explicit `on_resolve.rejected: fail` sentinel the
  author can also write, so the default is discoverable in the schema, not just prose.

---

## Cross-cutting notes

- **Architecture (KISS/YAGNI/DRY):** Overall lean. `ENGINE_DISPATCH_KINDS` as the single
  lint+dispatch registry is the right DRY move. Two-authoring-surfaces (file + attach) is a
  sound constraint. Watch the two DRY smells above (`outcome`/`decision`; duplicated context
  type). No over-engineering spotted; if anything the plan is appropriately minimal (no hub view
  registry, `view_ref` denormalized at apply).
- **Testing/build/lint:** Per-phase DoDs consistently pair unit tests + golden fixtures +
  user-proof rubrics — strong. Two gaps: (a) no phase asserts a **typecheck/lint/build of the
  scaffolded Vite view** in CI (03b/03 snapshot the tree but don't `npm run build` it — 03-U3
  is the closest, keep it and add it to CI); (b) `--strict` lint should probably also cover
  "referenced view not built."
- **Docs:** 08's doc-role split and tutorial-parity matrix are excellent and enforce the
  north star. Main risk is volume (16 tutorial pages + 20+ doc rewrites) concentrated in one
  phase; the tracker's "same-PR docs" rule mitigates this if actually honored.
- **Desktop live reload:** not addressed (Q-A). Given the tree already has desktop HMR
  scaffolding, decide whether view bundles get a dev loop before authors are told the product is
  "custom views first."
- **Conceptual alignment:** the plan, philosophy.md, deferred.md, and the tracker are tightly
  aligned on the north star — this is the plan's best quality. The only alignment defect is the
  stale spec §21 "optional" label (fix in 06/08).

---

## Priority actions

**P0 — resolve before 03b/06 ship (define the author-facing surface correctly):**
1. Unify the gate view **context type** (one shape, flat vs nested decided) across 03b + 06;
   reference `@murrmure/view-sdk` type, don't redeclare.
2. Add the normative **gate resolve wire mapping** (view submit → `resume_data` → `steps.<id>.output`),
   and decide `outcome`'s layer.
3. Answer **Q1 (view-sdk distribution)** — 08-T1 non-contributor path is blocked without it.
4. Answer **Q-A (view dev loop / live reload)** — otherwise "views are the product" ships with a
   painful edit cycle.

**P1 — consistency & de-drift (before 07 merge / during 04a):**
5. Fix spec §21: phase 06 **required**; add 03b + 10; fix §5.6 stale plan links.
6. Reconcile the two `known-gaps.md` files and the B7/B8 phantom IDs before relying on the
   08-U4 sync CI gate.
7. Strip "FDK worker packages remain optional" and `name: murrmure-flow` from `SKILL.md` in 04a.
8. Unify CLI scaffold taxonomy (`space flow init` vs `view init`); renumber `03b`.

**P2 — clarity & polish:**
9. Add the glossary block to `index.md`.
10. Add `--strict` "referenced view not built" lint (extends 01) and CI build of the scaffolded
    view (extends 03/03b).
11. Confirm the `on_resolve.rejected` default and make it a writable sentinel.
12. Specify `payload_ref` producer for gates.

---

*End of Plan Review 1.*
