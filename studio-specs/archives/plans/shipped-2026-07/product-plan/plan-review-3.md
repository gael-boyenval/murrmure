# Plan Review 3 — Verification, Docs & Deprecation Cleanup

**Reviewer:** Agent 3 (verification focus)
**Date:** 2026-07-03
**Scope reviewed:** [index.md](./index.md), phases 01, 02, 03, 03b, 04, 05, 06, 07, 08, 10, [00-doc-skill-mcp-tracker.md](./00-doc-skill-mcp-tracker.md), [09-review-synthesis.md](./09-review-synthesis.md), plus live codebase state (`packages/*`, `apps/docs/*`, `packages/cli/skill/*`, `.github/workflows/ci.yml`, `vitest.config.ts`, `package.json`, `studio-specs/current/product/spec.md`).
**Status at review time:** all phases 01–10 are `⬜ not started` — this is a **pre-execution plan audit**, not a progress audit. Findings below are about whether the plan, if executed exactly as written, would produce a verifiably-working, doc-clean product.

---

## Executive summary

The plan is unusually rigorous for a pre-implementation spec: every phase has a Code/Tests/Docs/Proof `Definition of done`, fixture file names are pre-assigned, and a living doc tracker ([00-doc-skill-mcp-tracker.md](./00-doc-skill-mcp-tracker.md)) maps every phase to specific files. That said, three classes of problems would let phases "complete" on paper without the product actually being verifiably correct or clean:

1. **The flagship UX (review-loop, ViewCanvasHost, gate views) has no automated end-to-end proof.** Reference-workflow criteria R2–R5 ([10](./10-reference-workflow-preview-review.md)) and tutorial proofs 08-T1–T3 are all manual/human-run scripts on Desktop — there is no Playwright/browser-automation harness anywhere in the plan for the one workflow the whole rewrite exists to deliver.
2. **The doc/gap tracker is already out of sync with itself, before any phase has shipped.** `apps/docs/guide/known-gaps.md` (human) and `packages/cli/skill/reference/known-gaps.md` (agent) are supposed to be identical (tracker rule + future 08-U4 CI gate), but today the skill file has B9/B10 that the human file omits entirely. `studio-specs/current/product/spec.md` §21 still labels phase 06 "optional," contradicting the plan's own rev-3 correction, and is missing rows for phases 03b and 10 altogether.
3. **Phase 07's deletion inventory contains at least one non-existent target** (`packages/studio-hub-daemon/`, claimed ~324 files) — the package does not exist anywhere in the current repo (`packages/` has 15 entries, none matching `studio-*`). This means the FDK deletion audit was not fully verified against the live tree, which undermines confidence in the rest of a very large, high-risk deletion inventory.

None of this blocks starting execution (01→02→03 is sound), but P0/P1 items below should be fixed in the plan text itself before phases 06–08 are trusted at face value.

---

## Scorecard (1–5)

Criteria 3 and 4 are the primary focus (detailed below); 1, 2, 5, 6, 7 use the working definitions from [09-review-synthesis.md](./09-review-synthesis.md)'s own review structure (architecture, sequencing, risk/scope, agent DX, north-star alignment) and are scored briefly.

| # | Criteria | Score | Note |
|---|----------|-------|------|
| **3** | **Specification & verification rigor** | **3/5** | Strong per-phase DoD structure and fixture naming, but the flagship review-loop UX has zero automated E2E coverage, several "Proof" lines are unverifiable prose (manual TTY/Desktop runs indistinguishable from CI-gated ones), and phase 07's inventory has a fabricated deletion target. |
| **4** | **Docs/spec/plan hygiene** | **3/5** | Tracker is thorough and maps every phase to files, but is not CI-enforced until phase 08 (self-reported checkboxes for 7 phases), and the tracker's own cross-reference artifacts (known-gaps sync, spec §21) are *already* inconsistent today. |
| 1 | Architecture soundness | 4/5 | Layer model (protocol/flow/view/shell/CLI) is coherent and consistently applied; `view-sdk` deprecation map is precise. |
| 2 | Sequencing & dependencies | 4/5 | 01→02→03b→03→06→10→04a→05→07→08 is logical; one soft circularity noted below (02's own proof depends on artifacts from 03/03b/06/08). |
| 5 | Risk & scope realism | 3/5 | Risk register is honest about 07 blast radius but doesn't register the phantom-package and CI pack-smoke breakage risks found in this review. |
| 6 | Agent/DX readiness | 4/5 | Skill restructure (04a/04b) and eval fixtures are well specified; eval pass threshold (≥5/6) is inherently non-deterministic and not CI-integrated. |
| 7 | North-star/product alignment | 5/5 | Every phase doc explicitly reiterates ViewCanvasHost-as-primary / shell-as-admin; this is the plan's strongest dimension. |

---

## Phase-by-phase verification matrix

| Phase | Plan acceptance criteria | Tests specified | Tests exist today | Gap |
|-------|--------------------------|------------------|--------------------|-----|
| **01** Apply validation | Apply warns on unsupported step kinds pre-02; `--strict` fails; hub returns `warnings[]` | `space-apply.test.ts` gate-warn + strict-fail cases; fixture `unsupported-step-kind.json` | `packages/cli/test/space-apply.test.ts` exists (no gate-lint cases yet); no `engine-capabilities.ts` file yet; fixture dir `studio-specs/current/fixtures/space-apply/` doesn't exist | No hub-side test is named for the `warnings: [...]` HTTP response shape — DoD only lists it under Code, not Tests. Add an explicit hub-daemon apply-route test. |
| **02** Engine completion | Gate dispatch, `on_resolve` branching, step-output templating, `MURRMURE_INPUT`; 2-round loop in CI without `open-confirm-gate.mjs` | 3 unit tests + 3 fixtures (`declarative-gate-chain`, `step-output-chaining`, `gate-loop-on-resolve`) | `advance.ts` today dispatches `invoke` only (confirmed by reading source); zero gate-dispatch tests exist | **Circular proof dependency**: the phase's own "Proof" line references `preview-review-v2` (a phase 08 tree that itself depends on 03/03b/06 for its view). There is no fixture-only / headless proof of the 2-round loop that doesn't implicitly wait on later phases. Cycle-detection "max depth 32" has no named test. |
| **03** Space flow scaffold | `space flow init` scaffolds ≤7-file hello-gate tree; naming guard blocks `flow init` in a `murrmure/` repo | CLI snapshot test + fixture `space-flow-init-hello-gate.json` | `packages/cli/src/commands/space/flow-init.ts` doesn't exist yet | 03-U2 (naming-guard redirect message) is listed only as a manual "Proof" row, not as an automated test in the "Tests" checklist — should be a `flow/commands.ts` unit test, not just a proof script. |
| **03b** View SDK | `createViewMount`/`ViewProvider`/hooks ship; `view init` scaffolds Vite+React; wire protocol (`murrmure.view.ready/submit/cancel`) works | `packages/view-sdk/test/app-bridge.test.ts` (context in/submit out); CLI snapshot | `packages/view-sdk/src/app/*` doesn't exist; existing tests (`host.test.ts`, `params-form.test.ts`) only cover the **host** side | The only new test specified is isolated to the view (app) side. Nothing verifies the app-bridge test's postMessage shape against the **existing host** (`ViewHostFrame`/`attachViewHostBridge`) in the same run — an integration test that mounts both sides and exchanges a real message is missing. The DoD "Proof" (Desktop shows iframe, working submit) is manual-only. |
| **04** Unified skill | 04a: skill renamed, router rewritten; 04b: full reference tree, eval ≥5/6 | `skill-install.test.ts`; `skill-eval/*.json` fixtures | Neither exists yet; current `SKILL.md` still `name: murrmure-flow` | Eval threshold (≥5/6 keyword match) is a non-deterministic LLM-judged gate with no stated CI wiring (which model, retries, flake tolerance). This can't be a hard CI gate as specified — needs to be called out as advisory/manual until made deterministic. |
| **05** CLI wizards | `mrmr setup`/`space onboard` execute (not print) init/link/apply; TTFRun ≤20min (MVP) / ≤10min (full) | Mocked clack tests; fixture `wizard-onboard-smoke.json` | `packages/cli/test/wizard/` doesn't exist | Of the four user-proof IDs (05-U1a/b, U6, U7), only **05-U6** (`setup --yes` CI smoke) is CI-automatable as written; U1a/U1b/U7 require a human at a TTY / Desktop. Plan doesn't visually distinguish "CI-gated" vs "manual per-release" proofs anywhere — same ID-table format is used for both, inviting false confidence that all rows are automated. |
| **06** gate.requires_view | ViewCanvasHost replaces ViewDrawer as default at gate/start; fills primary region | Shell width test; gate-submit→resolve→branch test; fixture `gate-requires-view.json` | `ViewCanvasHost` doesn't exist; `ViewDrawer.tsx` and `ViewDrawer.stories.tsx` exist and are the current default | "`ViewDrawer` deleted or `@deprecated` dev-only" is a soft either/or DoD bullet with **no test or grep gate** enforcing either outcome. The phase 07 grep gate (see below) does **not** include `ViewDrawer` or `GateResolvePanel`, so nothing in CI would catch these narrow-UI paths silently remaining reachable as a "primary" path after 06 ships. |
| **07** FDK deletion | Zero FDK surface in shipped paths; grep gate passes; CI green | Named grep command; "CI green after deletions"; "no test imports deleted modules" | N/A (nothing deleted yet) | See dedicated section below — inventory includes a **non-existent package**, the grep gate omits `ViewDrawer`/`GateResolvePanel`/`mount.tsx`, and "port or delete 17+ hub-daemon tests" (M3) has no explicit per-test disposition, including the **security** tests (mount collision, worker-env sanitization) that currently only cover FDK surfaces. |
| **08** Docs & proof | Tutorial parity (08-T1–T4), doc checklist, golden fixtures, CI honesty gates, TTFRun ≤10min | Fixture list (11 rows); CI checks (known-gaps diff, FDK grep, VitePress link check); 08-U1–U6 | None of the fixtures/CI scripts exist yet | 08-T1–T3 (non-contributor completes tutorial on Desktop) have **no automation** — pure manual QA scripts. "spec §21 status matches plan index (**script or manual review** each release)" explicitly permits a non-automated check for the one artifact that's supposed to be the honesty backstop — and as shown below, that manual review has already lapsed once (see Doc tracker audit). DoD checklist says "B1–B6 removed from both known-gaps files when phases ship" but never states a closure criterion for **B9/B10**, which 02/03b/10 are supposed to close. |
| **10** Reference workflow | R1–R6 acceptance criteria for the preview-review loop | None specified beyond R1 (`apply --strict`) and R6 (grep for FDK commands) being naturally testable | `examples/flows/preview-review-v2/` doesn't exist | **R2–R5 (the actual human-in-the-loop UX: scaffold→run, ViewCanvasHost render, request-changes round-trip, approve→terminal) have no described automated test of any kind** — not unit, not integration, not E2E/browser. This is the single biggest verification gap in the whole plan: the flagship workflow is provable only by a human clicking through Desktop. |

---

## CI/build/lint/typecheck coverage

- **No lint tooling exists anywhere in the repo.** No `lint` script in root `package.json` or any package `package.json`; no ESLint/Biome config found. The user's verification bar ("build, types, lint, unit, integration, E2E per phase") cannot currently be met for the "lint" dimension because there is nothing to run. None of phases 01–10 propose adding one, and none list "lint" as a DoD/Proof step (expected, since the tool doesn't exist — but this should be called out as a known blind spot, not silently absent).
- **`pnpm typecheck` (`pnpm -r typecheck`) is never invoked in CI** (`.github/workflows/ci.yml` runs Build → Test → Acceptance tests → Pack smoke only). No phase's Proof section runs `pnpm typecheck` either — a grep of the whole plan directory for `typecheck` returns zero phase-doc hits. Given the plan adds new cross-package types (`FlowGateStepSchema.on_resolve`, `ViewAppContext`, `ViewHostContext` extensions), this is a real gap: a PR could pass `pnpm build` (which may or may not run `tsc --noEmit` per package) while leaving type errors in packages that only *consume* the new types without being rebuilt in the same pass.
- **`pnpm test:acceptance` only covers 2 of 15 vitest projects** (`@murrmure/hub-daemon`, `@murrmure/cli`) — `contracts`, `view-sdk`, `shell-web`, `shell-client` are excluded from the "acceptance" gate despite phase 03b/06 landing new contract and view-sdk surface. Phase 08's "`pnpm test:acceptance` includes phase fixtures" bullet should also broaden the acceptance project list, or explicitly justify the exclusion.
- **CI's own "Pack smoke" step invokes the exact command phase 07 deletes**: `.github/workflows/ci.yml` runs `mrmr flow init test-flow --dir "$FLOW_DIR/test-flow"` and asserts on `flow.manifest.json`/`package.json`. Phase 07's CLI deletion table marks `mrmr flow init` **Delete**, and the CI section only lists "`.github/workflows/ci.yml`, `release.yml` flow-kit publish/pack steps — Remove," which reads as scoped to *publish* steps, not this *smoke-test* step. This CI job will fail the moment `init.ts`'s FDK path is deleted unless someone remembers to rewrite the pack-smoke step to exercise `mrmr space flow init` instead. **Recommend an explicit line item in phase 07 (or 07-pre) for rewriting this CI step.**
- `check:boundaries` (dependency-cruiser) and the vitest `projects` array both still include `packages/flow-dev-kit` — phase 07's packages table does cover removing these paths, so this is correctly scoped, just flagging that it's a **hard CI dependency**, not incidental: if 07d deletes the package but forgets this line, `pnpm test`/`check:boundaries` fail outright (fail-safe, but worth a named checklist bullet in 07d rather than a generic "Remove flow-kit refs").

---

## Reference workflow R1–R6 traceability

| ID | Criterion | Phase(s) that implement it | Automated today | Automatable as specified |
|----|-----------|------------------------------|-------------------|--------------------------|
| R1 | `preview-review-v2` passes `apply --strict` | 03, 03b, 02 (lint from 01) | No (tree doesn't exist) | **Yes** — CI `space apply --strict` |
| R2 | Non-contributor scaffolds/clones → apply → Run on Desktop | 03, 05 | No | **No** — requires human or Desktop-automation harness (Playwright/Electron driver) not present anywhere in the stack |
| R3 | Round 1 preview visible in ViewCanvasHost (not drawer/form) | 06 | No | **No** — visual/DOM assertion needs a browser test; only mentioned as a manual proof under 06/08-T1 |
| R4 | Request changes → build step reruns → round 2 preview updates | 02, 06 | No | **Partially** — the engine half (`on_resolve.rejected → goto build`) is unit-testable via fixtures; the UI half (view re-render with new `steps` snapshot) is not |
| R5 | Approve → terminal state, session shows completed | 02 | No | **Yes** — engine-level, fixture-testable |
| R6 | Zero FDK commands used in the flow | 07, 08 | No | **Yes** — grep gate |

**Conclusion:** 3 of 6 acceptance criteria (R1, R5, R6) are cleanly CI-automatable with fixtures already implied by the plan. R2 and R3 are pure UI/UX claims with **no test strategy proposed at all** — not even a manual test script beyond the tutorial (08-T1) prose. Given phase 06 is graded "A+ / required / north-star centerpiece" in [09-review-synthesis.md](./09-review-synthesis.md), the plan should invest in at minimum a scripted browser check (Playwright against the bundled Desktop shell, or a component-level test asserting ViewCanvasHost occupies the primary region and is not `Sheet`/`max-w-lg`) rather than relying solely on human QA.

---

## Doc/skill/MCP tracker audit (00-doc-skill-mcp-tracker.md)

**Completeness (instruction 6):** every phase 01, 02, 03, 03b, 04a, 04b, 05, 06, 07, 08 has its own checklist section with Code/Spec/Bridge/Skill/Docs/Fixture rows — this part is genuinely thorough and is the plan's strongest hygiene mechanism. Two structural gaps:

1. **Phase 10 (reference workflow) has no dedicated tracker row.** It's referenced from inside 03/06/08 sections, but as the flagship spec doc it arguably deserves its own line (e.g., "keep §Runtime sequence + Acceptance criteria in sync with actual engine/view wire shape as 02/03b/06 land").
2. **Enforcement is entirely manual until phase 08.** The tracker is a checklist of `- [ ]` boxes with no CI script checking that a given phase's PR actually touched the files it lists. Phases 01–07 rely on reviewer discipline; only phase 08 introduces "known-gaps sync" and "FDK grep" as CI checks. Recommend at least a lightweight "tracker-touched-files" CI check as early as phase 01, since this is exactly the kind of drift already observed live (next point).

**Live drift already present (not hypothetical — verified against current repo):**

- `apps/docs/guide/known-gaps.md` (human) lists **B1–B6** only. `packages/cli/skill/reference/known-gaps.md` (agent) lists **B1–B6, B9, B10** — B9/B10 are missing from the human doc entirely. The tracker's cross-cutting artifact table states these two files must match ("agent-facing gap list — **must match human**"), and phase 08's own 08-U4 proof requires them to be byte-identical. This mismatch predates any phase shipping, so it will only get worse unless a phase (recommend 03b, since it's the phase that introduces B9) adds "sync known-gaps B9/B10 into human doc" to its own tracker row.
- `studio-specs/current/product/spec.md` §21 ("Implementation backlog") still reads: `06 | gate.requires_view (optional; closes B4)`. This directly contradicts [09-review-synthesis.md](./09-review-synthesis.md) §1a/§3 ("**Correction to rev-2**: ... phase 06 is required") and [index.md](./index.md)'s "Hard gates" section. §21's phase table is also missing rows for **03b** and **10** altogether, and its "Gap mapping" reference (`B1–B6`) doesn't mention B7–B10 which are already live concepts elsewhere in the plan. Since spec.md is declared **normative**, this is a real, current inconsistency between the two documents that claim to be "the spec." Phase 08's checklist item "spec.md §21 — phase table matches index.md" should fix this, but nothing stops it from staying stale through phases 01–07 since it isn't gated per-phase.
- Phase 02's docs checklist cites "`current/product/spec.md` §5.2 — gate runtime" — §5.2 in the live doc is actually **"Flow manifest"** (general), while gate-runtime detail lives in **§5.6** ("Gate steps in flow manifests (partial — see §21)"). Minor, but should be corrected to §5.6 so the phase's own docs checklist points at the right anchor.

---

## Deprecated concept inventory

| Concept | Where it still lives today | Phase that deletes/replaces it | Verified present? |
|---------|------------------------------|-------------------------------|--------------------|
| `flow-dev-kit` package (`@murrmure/flow-kit`) | `packages/flow-dev-kit/` (16 source files); root `package.json` `dev` script; `vitest.config.ts` project entry; `dependency-cruiser` boundary list | 03b ports `/react`; 07d deletes package | ✅ exists |
| FDK worker runtime (mount/bundle/live-apply) | `packages/hub-daemon/src/{flow-worker-pool,worker-supervision,mount-registry,bundle-ingest,bundle-store,live-apply,host-bridge}.ts`, `capability-worker-entry.js` | 07a/07b | ✅ all exist as named |
| `ViewDrawer` (narrow side-sheet, wrong host) | `packages/shell-web/src/components/ViewDrawer.tsx` + stories | 06 ("deleted or `@deprecated` dev-only") | ✅ exists; **soft DoD wording, no grep gate** |
| `GateResolvePanel` (built-in form) | `studio-specs/current/shell/spec.md` names it as current default; component presumably in `shell-web` | 06 demotes to fallback-only; never deleted | ⚠️ correctly kept as fallback per north star, but no test asserts it's *not* the default path post-06 |
| `packages/studio-hub-daemon/` (~324 files, "duplicate package") | **Does not exist.** `ls packages/` = `cli, contracts, executors, flow-dev-kit, hub-core, hub-daemon, hub-persistence, runtime-*, shell-*, view-sdk` — no `studio-*` entries anywhere | 07d (M7) | ❌ **not found in repo** — plan references a phantom target |
| Skill id `murrmure-flow` | `packages/cli/skill/SKILL.md` frontmatter `name: murrmure-flow`; `apps/docs/guide/agent-skill.md` install path `.cursor/skills/murrmure-flow/` | 04a | ✅ exists |
| `evolution-pipeline.md`, `capability-authoring.md`, `workers.md` (skill) | `packages/cli/skill/reference/*.md` | 04a delete-refs, 07f delete files | ✅ all exist |
| `mrmr flow push`/validate/build/dev | Referenced across ~15+ doc files (`flow-authoring.md`, `views.md`, `SKILL.md`, most `apps/docs/guide/*`) still today | 07c/07f | ✅ pervasive, matches phase 07's own "delete or redirect" table |
| CI `mrmr flow init` smoke step | `.github/workflows/ci.yml` "Pack smoke" job | **Not explicitly named in any phase** | ✅ exists — see CI section above; **gap** |

---

## Stale docs & skill fragments (file paths)

Content confirmed still FDK-centric as of this review (pre-phase-04/07/08, expected — listed so the eventual PRs have a concrete starting punch list):

- `apps/docs/guide/agent-skill.md` — 118 lines (target: <30 after phase 04); still documents `.cursor/skills/murrmure-flow/`, `mrmr flow init my-flow --with-skill`, "Legacy FDK checklist," and links "Flows tutorial — full FDK walkthrough."
- `apps/docs/guide/agents-mcp.md` — 169 lines (target: ≤20 after phase 08); still tells flow builders to install the skill "so coding agents follow version bumps and the evolution pipeline."
- `packages/cli/skill/SKILL.md` — frontmatter `name: murrmure-flow`; body says "FDK worker packages remain optional," lists `mrmr flow validate/build/push` as a "Quick command," and links `reference/evolution-pipeline.md` as a live reference.
- `packages/cli/skill/reference/views.md` — describes `ViewDrawer` as the current (correct, for now) shell behavior; will need a full rewrite at phase 06, not just a note update, since the whole "Shell run flow" section is drawer-shaped.
- `packages/cli/skill/reference/flow-authoring.md` — `requires_view` documented as "Start only... opens ViewDrawer."
- `apps/docs/reference/flow-dev-kit.md`, `apps/docs/guide/flow-evolution.md` — already partially edited (uncommitted `git diff` shows in-flight changes) but still exist as full pages; phase 07 deletes both.
- `studio-specs/current/acceptance.md` — entirely FDK/CDK-shaped (flow-runtime CR rows, feature-spec FS rows, `phase2-full-chain.json` bundle-push fixture); zero rows for any v2 phase. Phase 07-pre P2/M2 correctly targets a rewrite, but until that lands this file is 100% describing the product being deleted, with none of the acceptance surface the new phases need.
- `studio-specs/current/product/spec.md` §21 — stale "optional" label + missing 03b/10 rows (see tracker audit above).
- `~15 `apps/docs/guide/**` pages still reference `flow push`/`flow validate`/`flow build`** per live grep (`quick-start.md`, `cli.md`, `creating-flows.md`, `how-it-fits-together.md`, `review-workflow.md`, `configuration.md`, `installation.md`, `space-index.md`, all three tutorial tracks, `multi-agent-feature-spec.md`) — matches phase 07/08's own delete/rewrite tables almost 1:1, confirming those checklists are complete in scope, just not yet executed.

---

## Definition of Done — can we be SURE everything works?

Assuming every checkbox in every phase's DoD is ticked exactly as written:

- **Engine/CLI correctness: yes, with high confidence.** Gate dispatch, `on_resolve` branching, step-output templating, apply linting, and scaffold trees all get fixture-backed unit tests plus `--strict` apply checks. This layer is genuinely well specified.
- **The human-facing review-loop UX: no.** As shown in the R1–R6 traceability table, the two criteria that actually prove "a human can review a preview and approve/reject it in a real canvas" (R2, R3, partially R4) have no automated test anywhere in the plan — only manual Desktop walkthroughs (08-T1). Since this loop is explicitly the plan's flagship deliverable and north-star centerpiece, "everything works" cannot be claimed with CI-level confidence, only with release-QA-level confidence.
- **FDK deletion safety: no, not as currently specified.** The inventory has a phantom target, the grep gate doesn't cover `ViewDrawer`/`GateResolvePanel`/`mount.tsx`, and "port or delete 17+ tests" (M3) has no explicit per-test disposition — in particular the two **security** tests in `acceptance.md` (mount collisions, worker-env sanitization) currently only exercise FDK code paths and the plan doesn't say whether v2 needs equivalent coverage or whether that security surface simply goes away with the FDK runtime. This should be an explicit decision, not an implied one.
- **Docs staying truthful throughout, not just at the end: no.** The tracker has no CI teeth until phase 08, and the two artifacts meant to be the "living source of truth" (known-gaps parity, spec.md §21) are already out of sync before phase 01 has even started. Nothing in phases 01–07 would catch further drift.
- **Type/lint safety: partially.** `pnpm build` runs in CI; `pnpm typecheck` does not; lint doesn't exist as a concept in this repo at all. Given the plan is not proposing to add lint tooling, this should at minimum be named as an accepted gap in the plan rather than left unaddressed.

**Bottom line:** phases 01–05 and 07 (engine/CLI/deletion mechanics) can be verified with high confidence if executed as specified (modulo the fixes below). Phase 06/10 (the actual product experience) cannot currently be verified by CI at all — only by a human. If "we KNOW everything works" is the bar, the plan needs an explicit browser-automation or component-level UI test strategy for ViewCanvasHost before phase 06 is called done.

---

## Cross-cutting notes (criteria 1, 2, 5, 6, 7)

- **Architecture (1):** the flow-kit → view-sdk deprecation map (03b) is the cleanest piece of the whole plan — a precise 1:1 symbol rename table with clear "keep vs delete with FDK" boundaries. No concerns.
- **Sequencing (2):** build order graph in [index.md](./index.md) is coherent, but phase 02's "Proof" line creates a soft forward dependency on 03/03b/06/08 artifacts (see matrix above) that isn't reflected in the dependency graph itself — 02 is drawn as unblocking 06/10, not as depending back on them for its own proof.
- **Risk (5):** the risk register (09-review-synthesis §8) correctly flags "07 breaks monorepo tests" and "v2 demos missing before delete" as High severity, but doesn't have a row for "deletion inventory references non-existent code" or "CI pack-smoke step invokes a deleted command" — both are concrete, already-discoverable risks this review surfaced by reading the live tree, not hypotheticals.
- **Agent DX (6):** 04a/04b's skill restructure and the wizards.md "human vs agent command equivalents" split are well thought through. The one soft spot is the ≥5/6 eval threshold being treated as a pass/fail CI gate when it's actually a probabilistic LLM-judged score with no stated model/retry/flake policy.
- **North-star alignment (7):** consistently the strongest thread in the plan — every phase doc restates ViewCanvasHost-primary / shell-admin framing, and `studio-specs/current/shell/spec.md` and `deferred.md` are already updated to the corrected (required, not optional) framing even though phase 06 hasn't shipped. The one place this framing hasn't propagated is `spec.md` §21 (still says "optional").

---

## Priority actions

**P0 (fix in plan text before execution proceeds past 03):**

1. Correct `studio-specs/current/product/spec.md` §21 — change phase 06 from "optional" to required, add missing rows for 03b and 10, extend the gap-mapping reference to B7–B10.
2. Verify and correct phase 07's "Duplicate packages" deletion target — `packages/studio-hub-daemon/` does not exist in the repo; either remove this row or replace it with whatever the intended real target is (re-audit `packages/` against the live tree before merging phase 07).
3. Sync `apps/docs/guide/known-gaps.md` with `packages/cli/skill/reference/known-gaps.md` (add B9/B10 to the human doc now, don't wait for phase 08's CI diff to discover it).

**P1 (fix as part of the owning phase's DoD, before that phase is called done):**

4. Add `ViewDrawer`/`GateResolvePanel`/`mount.tsx` to phase 07's verification grep gate (or add a dedicated phase 06 grep gate), so nothing silently keeps the narrow/built-in path reachable as default.
5. Add an explicit CI line item to phase 07 (or 07-pre) rewriting `.github/workflows/ci.yml`'s "Pack smoke" step off `mrmr flow init`.
6. Give phase 10's R2/R3/R4 UX criteria a real automated test strategy (component-level ViewCanvasHost width/host assertion at minimum; browser automation at best) instead of leaving them as manual-only.
7. Make an explicit decision (and write it into phase 07's M3) on whether the `acceptance.md` security tests (mount-collision, worker-env sanitization) need v2 equivalents or are being intentionally dropped with the FDK runtime.
8. Add a hub-daemon test for the `warnings[]` HTTP response shape to phase 01's Tests section (currently only in Code).

**P2 (polish / hygiene, non-blocking):**

9. Fix phase 02's docs cross-reference from spec.md §5.2 to §5.6.
10. Visually distinguish CI-automatable proof IDs from manual/human-only proof IDs across all phases (currently identical table formatting implies false parity).
11. Add a phase-10 row to the doc tracker.
12. Broaden `pnpm test:acceptance`'s project list beyond hub-daemon/cli, or explicitly justify the current scope.
13. Add `pnpm typecheck` as an explicit CI step (currently only `pnpm build`/`pnpm test`/`pnpm test:acceptance` run).

---

## Open questions (verification-related)

1. **How is the review-loop UX (R2–R5, 08-T1) actually meant to be proven in CI, if at all** — is manual QA per release the accepted permanent answer, or is browser automation (Playwright against the bundled Desktop shell) planned for a later phase not yet written?
2. **What happens to the 17+ hub-daemon FDK tests in M3** — is there a concrete per-test disposition list (port vs delete), or is "port or delete" left to whoever executes 07-pre to decide ad hoc?
3. **Is the skill eval (≥5/6, 04b) intended to run in CI at all**, and if so with which model/provider, and what's the retry/flake policy for a probabilistic gate?
4. **Does `packages/studio-hub-daemon/` refer to a package that was already deleted in an earlier, unrecorded cleanup**, or was this row copied from stale planning notes / a different branch state? Worth a quick author confirmation before phase 07 is treated as fully scoped.
5. **Should the doc/skill/MCP tracker have any CI enforcement before phase 08** (e.g., a "changed files include a tracker-listed doc" check on phases 01–07 PRs), given drift is already observable pre-execution?

---

*End of plan review 3.*
