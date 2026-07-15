# 13 — Complete the clean-slate cutover

**Status:** Built — review blocked (see Handoff; legacy v2 runtime teardown + grant-mint cross-surface sweep outstanding)  
**Build order:** 13  
**Depends on:** 01–12  
**Source work packages:** removal/integration subset of T15

## Goal

Prove that the new vertical capabilities form one coherent clean product and that every superseded public shape, runtime path, fixture, current spec, user doc, skill, scaffold, and operator message has been removed or replaced.

This is a verification/removal gate. Earlier tasks must remove their own legacy paths; this task catches cross-surface leftovers and must not become a deferred implementation bucket.

## User stories

- As a new user, I encounter one vocabulary and one behavior across tutorial, CLI, Desktop, APIs, and skills.
- As a maintainer, CI prevents removed concepts from returning.
- As an operator, I receive one clear local reset procedure and no hidden compatibility mode.
- As a reviewer, current normative specs describe exactly what the clean code implements.

## Contracts

- No compatibility code, aliases, adapters, dual reads/writes, migrations, or deprecation windows.
- Strict schemas reject removed authoring fields with normal unknown-field/invalid-union errors.
- Remove and guard at least:
  - flow `start`, `requires_view`, step `role`/`presentation`, wait shapes, nullable/old routing, parent completion/goto vocabulary;
  - lifecycle-only handler dispatch, authored `kill_on`, `HANDLER_MISSING`, role-based matching;
  - direct/base64 View mutation, View-held tokens, old postMessage/API/SDK exports, built-in resolver forms;
  - old grant/agent/onboard commands, token exports, embedded-token config, legacy `action:invoke` / `gate:resolve` capabilities and tool paths;
  - seed/package-catalog/FDK production/current guidance;
  - `.mrmr.temp/runs` and public local paths;
  - stale checkpoint/gate/human-step lifecycle and separate preview/running UI payloads.
- Historical archives may retain rationale only with explicit superseded/non-normative marking and exclusion from active guidance enforcement.
- `studio-specs/current/` wins and must be synchronized before plans are archived.

## Implementation

- Build a repository-wide absence/rejection matrix from every removal list in Tasks 01–12.
- Delete remaining code, schemas, types, commands, routes, components, fixtures, snapshots, examples, templates, and docs.
- Rename stale diagnostics where the clean protocol changed; keep no aliases.
- Explicitly remove or rename `CHECKPOINT_*` diagnostics and guard against checkpoint-era vocabulary in active surfaces.
- Sweep current specs, bridges, tutorials, references, skills, scaffolds, and changelog for contradictions.
- Add repository guards scoped to active surfaces while permitting marked archives.
- Update focused plan statuses and archive only when their behavior and acceptance are represented by completed tasks/current specs.
- Ensure package manifests/workspace files no longer include deleted production/test assets.

## Testing

### Automated

- Full unit/integration/E2E/typecheck/lint/build/package suite.
- Strict rejection tests for every removed schema/command/API shape.
- Repository absence guards across active code, specs, docs, skills, examples, and scaffolds.
- Docs-proof for all Tutorial v3 pages and affected references/skills.
- Package-content inspection for removed seeds, forms, stale bridge paths, and deleted assets.
- Tutorial fixture runs without test-only product bypasses.

### Manual

- Search CLI/Desktop help and UI for removed vocabulary and controls.
- Follow affected tutorial steps and cross-linked references as a first-time user.
- Exercise one invalid legacy example per major surface and verify immediate clear rejection.
- Perform the one-time local reset and confirm only clean behavior remains.
- Review current specs against observed API/UI behavior.

## Documentation, skills, specs, and ADRs

- **ADRs:** mark superseded ADRs explicitly and add supersession links from replacement ADRs. Create no new architecture in this cleanup task.
- **Normative specs:** complete sweep of `studio-specs/current/`, including product, CLI, Desktop, shell, handlers, step contract, artifacts, connections/grants, security, and acceptance.
- **User docs:** Tutorial v3, quick start, creating flows, handlers, agents MCP, View SDK, troubleshooting, and known gaps.
- **Skills:** agent and developer flow/handler/View/connection guidance.
- **Scaffolds/examples:** all generated flow, View, handler, and connection outputs.
- **Enforcement:** docs-proof, strict lint, forbidden-pattern matrix, package inspection.
- **Changelog:** complete clean-cutover removal and local reset notes.
- **Plans:** update active index and archive shipped focused plans only after current specs land.

## References

- [Coordinating plan T15](../2026-07-13-tutorial-v3-full-alignment.md)
- [Murrmure documentation sync rule](../../../.cursor/rules/murrmure-doc-sync.mdc)
- [Plans index](../README.md)
- [Current specs index](../../current/index.md)

## Done gate

- Every removed concept is absent from active repository surfaces and rejected at boundaries where user input can still contain it.
- Full tests, docs-proof, package inspection, and Tutorial v3 fixture pass.
- No normative/tutorial/code/skill/scaffold drift remains.
- Current specs and replacement ADRs are authoritative; old rationale is clearly archived.
- Remaining feature bugs return to their owning task rather than being patched opaquely here.

## Handoff

| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | glm-5.2-max | blocked | Clean-slate cutover build at HEAD `043d241`. Delivered the cross-surface leftover + guard + sync slice: removed stale Task 01–12 `test.skip` placeholders from the five Tutorial v3 skeleton suites and retargeted the `tutorial-v3-harness` Task 00 guard to forbid hidden failures and require every remaining skip to own a pending (Task 13/14) ID; removed the orphaned `FlowCheckpointStepSchema` from `@murrmure/contracts` (checkpoint steps are no longer authorable; the live `on_resolve` route schema used by gates is retained); cleared `@murrmure/shell-web` typecheck debt (`formatStepExecutorOutput` now handles `agent_stdout`, test fixture dropped an untyped `error_code`, non-shipped Storybook stories/prototypes that reference an uninstalled `@storybook/*` toolchain are excluded from the production `tsc -p`); removed `grant mint` / `space onboard` drift from active normative/guidance surfaces (`cli/spec.md`, `product/architecture.md`, `bridges/config.md`, `apps/docs/guide/how-it-fits-together.md`); strengthened `check:clean-state` to scan `packages/contracts/src` and reject `useViewSubmit`, `your_flows`, `available_to_run`, `HANDLER_MISSING`, and `FlowCheckpointStepSchema` from production source; and synced the root changelog. No compatibility aliases added; no new ADR (no new architecture, per plan). | Guards + docs-proof + spec-lint green: `pnpm check:docs-proof` chain (known-gaps, fdk-docs, clean-state, run-scratch-paths, nested-call-return) all OK, `docs-proof` 29/29, `pnpm spec:lint` OK. Tutorial v3 suite (all projects): 9 files, 40 passed + 1 skipped (Task 14 packaged placeholder). Affected unit tests (contracts, `step-executor-output`, `help-contract`): 8 files, 100/100. `pnpm -r typecheck`: `@murrmure/shell-web` now Done (was failing at HEAD); `@murrmure/contracts` Done after orphan removal. | Address blockers (see below); then re-review. |
| review | review | glm-5.2-max | blocked | Reviewed build HEAD `a53cf70` (working tree clean; parent `043d241` task-11 approved). The build's three self-declared blockers are all confirmed real, so the done gate is not met — verdict blocked. (1) Legacy v2 runtime is active in production source: `action:invoke`/`gate:resolve` capabilities (`packages/contracts/src/grants/capability.ts`), the `mrmr action invoke` CLI (`packages/cli/src/commands/action/invoke.ts`), gate/checkpoint/`on_resolve`/`goto` routing (`packages/hub-core/src/flow-engine/step-resolve.ts`, `gates/service.ts` via `isDeclarativeCheckpointStep`, `run/service.ts`), and base64 cross-space artifact registration — all still present and entangled with the gate kernel/run service/grants/persistence; correctly deferred to the T15 follow-on cutover under this task's no-deferred-implementation-bucket guardrail. (2) `packages/cli` typecheck debt is pre-existing, not introduced by Task 13: 17 errors (build said 14 — recount adds the second `preview-review-v2-example.test.ts:299` tuple error), all in files untouched by this commit (electrobun `self`×5, `run_policies`, `GlobalFlags`, `ChildProcess`, `fdk-docs-scan` decl, `CommandDef`, tuple×2, `SpaceApplyBundle`, `RequestInfo`×3); `pnpm -r typecheck` cannot go green until the electrobun env issue is resolved. (3) v2 tutorial docs (`apps/docs/guide/tutorials/01-local-preview-review`, `02-multi-agent-brief`, `03-daily-brief-trigger`) and legacy current bridges (`bridges/action-invoke.md`, `flow-engine.md`, `triggers.md`, `artifacts.md`, `desktop/spec.md`) remain describing the v2 surface; correctly deferred to the blocker-1 teardown. Positive claims verified: `FlowCheckpointStepSchema` gone from production (only in CHANGELOG/guard/task-file/explicitly-archived plans); the five skeleton suites' stale Task 01–12 `test.skip` placeholders removed and the `tutorial-v3-harness` Task 00 guard retargeted; `@murrmure/shell-web` + `@murrmure/contracts` typecheck now green; `grant mint`/`space onboard` removed from `cli/spec.md`, `product/architecture.md`, `bridges/config.md`, `apps/docs/guide/how-it-fits-together.md`; `check:clean-state` strengthened (scans `packages/contracts/src`, forbids `useViewSubmit`/`your_flows`/`available_to_run`/`HANDLER_MISSING`/`FlowCheckpointStepSchema`); CHANGELOG synced; no new typecheck debt introduced. ADDITIONAL in-scope finding the build missed: the `grant mint` cross-surface sweep is incomplete and unguarded — active surfaces still carry the removed command: `packages/cli/src/commands/auth.ts:84` (CLI `--web` flag description "bootstrap or grant mint instructions"), `packages/cli/skill-developer/reference/flow-authoring.md:180` (developer skill teaches `mrmr grant mint --capabilities …`), and `packages/cli/test/skill-eval/mcp-setup.json:7-8` (skill-eval fixture expects `mrmr grant mint`/`mrmr grant use`). The `docs-proof` connection-cutover guard scans only `apps/docs`, `studio-specs/current`, and `packages/cli/skill-agent` (not `skill-developer/`, not CLI source descriptive strings — only `root.ts`/`space/index.ts` registration — and not skill-eval JSON), and `check:clean-state` does not forbid `grant mint`/`space onboard`/`agent connect`, so the done-gate bullet "every removed concept absent from active repository surfaces" fails even for the non-deferred `grant mint` concept. (Legitimate "absent without aliases" enumerations in `cli/spec.md:293` and `bridges/grants-migration.md:61` are fine; `test-utils/spaces/preview-review-v2/agent.md:6` is part of the deferred v2 example set.) No code fixes made — per review scope and because the task remains blocked by deferred blockers regardless. | Guards green: `check:clean-state`, `check:known-gaps`, `check:fdk-docs`, `check:run-scratch-paths`, `check:nested-call-return`, `pnpm spec:lint` all OK; `pnpm check:docs-proof` chain EXIT 0, docs-proof 29/29. Tutorial v3 suite (root `vitest run tutorial-v3`, all projects): 9 files, 40 passed + 1 skipped (Task 14 packaged placeholder), EXIT 0. Affected unit tests: `@murrmure/contracts` 6 files/37 passed, `@murrmure/shell-web` step-executor-output 5 passed, `@murrmure/cli` help-contract 58 passed (== 100 tests, matching build's 100/100). Typecheck: `@murrmure/shell-web` green, `@murrmure/contracts` green, `@murrmure/cli` 17 errors all in Task-13-untouched files (pre-existing). Blocker probes: grep confirmed `action:invoke`/`gate:resolve` + `isDeclarativeCheckpointStep` active in production source; v2 vocab (`awaiting_human`/`useViewSubmit`/`contract_keys`/`base64`) present in the three v2 tutorial dirs; `grant mint` present at `auth.ts:84`, `flow-authoring.md:180`, `mcp-setup.json:7-8`. | Task 13 fix turn (small, in-scope, non-deferred): remove `grant mint` from `auth.ts:84`, reteach `flow-authoring.md:180` via `connection create`, update `mcp-setup.json` skill-eval, and extend `check:clean-state` (or `docs-proof`) forbidden patterns to cover `skill-developer/`, CLI source descriptive strings, and skill-eval JSON for `grant mint`/`space onboard`/`agent connect`. Blockers 1–3 remain owned by the T15 follow-on cutover / CLI typecheck-debt owners; do not patch here. |

### Blockers (return to owning task, not opaque patches here)

1. **Legacy v2 runtime teardown** — `action:invoke` / `gate:resolve` capabilities (`packages/contracts/src/grants/capability.ts`), the `mrmr action invoke` CLI (`packages/cli/src/commands/action/`), gate/checkpoint/`on_resolve`/`goto` flow-engine routing (`packages/hub-core/src/flow-engine/`, `gates/service.ts` uses `isDeclarativeCheckpointStep`), and base64 cross-space artifact registration remain active and entangled with the gate kernel, run service, grants, and persistence, with a large test suite asserting the behavior (`nested-resolve`, `graph`, `run-capacity-races`, `flow-call-acl`, `attach`, `resolve-step`, `advance-runner`, `first-week-setup`, `deprecated-removed`). The legacy MCP tools (`murrmure_complete_action`/`wait_for_gate`/`resolve_gate`) are already removed from the catalog. Full capability+CLI+route+machinery removal is a major refactor owned by dedicated follow-on cutover tasks (the removal/integration subset of T15), per this task's "no deferred implementation bucket" guardrail. Until then the done-gate bullet "every removed concept is absent from active repository surfaces" is not satisfiable for these items.
2. **`packages/cli` typecheck debt (pre-existing at HEAD `043d241`)** — 14 errors, baseline-confirmed identical with Task 13 changes stashed: 5 `electrobun` node_modules `self` errors (environment/dependency, not clean-cutover code), plus `run_policies` fixture drift (`space-directory.ts:151`, `docs-proof.test.ts:269`), `GlobalFlags | {}` (`space-doctor.ts:858`), `ChildProcess` (`view-dev.ts:175`), `fdk-docs-scan.mjs` declaration (`docs-proof.test.ts:523`), `CommandDef` generic (`flow-help.test.ts:29`), tuple type (`preview-review-v2-example.test.ts:299`), `SpaceApplyBundle` export (`space-apply.test.ts:12`), and `RequestInfo` ×3 (`space-doctor*.test.ts`). Cross-cutting debt from Tasks 08/09/12; `pnpm -r typecheck` cannot go green regardless until the `electrobun` env issue is resolved. The done-gate "Full typecheck pass" is therefore blocked.
3. **v2 tutorial docs + legacy spec bridges** — `apps/docs/guide/tutorials/01-local-preview-review/` (1b), `02-multi-agent-brief/`, `03-daily-brief-trigger/` still present the v2 model (`awaiting_human`, `useViewSubmit`, `contract_keys`-keyed handlers, base64), and `studio-specs/current/bridges/{action-invoke,flow-engine,triggers}.md`, `desktop/spec.md`, `http-api.md`, `mcp-tools.md`, `artifacts.md` rev-1 §7 still describe the active legacy surface. They depend on blocker 1 and must be removed/rewritten with that teardown, not ahead of it.

