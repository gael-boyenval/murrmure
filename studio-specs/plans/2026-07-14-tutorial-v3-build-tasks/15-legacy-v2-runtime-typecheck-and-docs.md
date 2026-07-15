# 15 — Legacy v2 runtime teardown, CLI typecheck, and v2 docs cutover

**Status:** In progress — Lane B approved; Lane A slice 1 complete, continuation in flight  
**Build order:** 15  
**Depends on:** 14  
**Source work packages:** removal/integration remainder of coordinating plan T15 (deferred from Tasks 13–14)

## Goal

Close the three deferred blockers that limited Tasks 13 and 14 partial approvals: remove the remaining legacy v2 runtime (`action:invoke` / `gate:resolve` / checkpoint routing), make `pnpm -r typecheck` green for `@murrmure/cli`, and retire v2 tutorial plus stale bridge documentation so only Tutorial v3 and the clean protocol remain in active guidance.

This task completes the clean-slate cutover started in Task 13. It is not a catch-all implementation bucket — behavior discovered here that belongs to Tasks 01–12 returns to those owners.

## User stories

- As a new user, I see one protocol vocabulary across CLI, Hub, Desktop, docs, and skills — no v2 checkpoint/gate/action-invoke paths.
- As a maintainer, `pnpm -r typecheck` passes repository-wide and CI blocks the removed runtime from returning.
- As a release operator, Tasks 13 and 14 done gates are fully satisfiable without partial deferrals.
- As a docs reader, v2 tutorials and bridges are archived or rewritten; Tutorial v3 remains the only active introductory path.

## Contracts

- No compatibility aliases, dual readers/writers, migrations, or deprecation windows.
- Remove and guard at least:
  - `action:invoke` and `gate:resolve` grant capabilities and every tool/route that requires them;
  - `mrmr action invoke` CLI command group and help/examples;
  - checkpoint-era flow-engine machinery (`isDeclarativeCheckpointStep`, `checkpoint-dispatch`, `checkpoint-resolve`, `checkpoint-runner`, `on_resolve`/`goto` routing that exists only for v2 gates);
  - base64 cross-space artifact registration and any public path that still accepts it;
  - v2 tutorial directories and bridge pages that describe the removed surface as current;
  - `CHECKPOINT_*` diagnostics and checkpoint-era vocabulary in active surfaces (rename or remove; no aliases).
- Retain and do not regress:
  - Task 08 nested `STEP_YIELDED` / `STEP_RESUMED` / `declared_children` / `returned_child` semantics;
  - Task 03+ `step:resolve` branch contracts and gate-free step resolution;
  - Task 02 connection create/activate and the `space:read`, `flow:read`, `flow:run`, `step:resolve` default profile.
- Historical archives may retain rationale only with explicit superseded/non-normative marking and exclusion from active guidance enforcement.

## Implementation lanes

Task 15 has three lanes. Lane C depends on Lane A. Lane B may proceed in parallel with Lane A when file ownership does not conflict.

### Lane A — Legacy v2 runtime teardown

**Owned paths (indicative):**

| Surface | Paths |
|---|---|
| Capabilities | `packages/contracts/src/grants/capability.ts`, grant migration/tests |
| CLI | `packages/cli/src/commands/action/**`, root command registration |
| Flow engine | `packages/hub-core/src/flow-engine/step-resolve.ts`, `checkpoint-*.ts`, `advance.ts`, `engine-capabilities.ts` |
| Gates | `packages/hub-core/src/gates/service.ts` (`isDeclarativeCheckpointStep` and v2-only branches) |
| Run service | `packages/hub-core/src/run/service.ts` and related v2 gate lifecycle |
| Hub daemon routes | action-invoke/gate-resolve HTTP/MCP surfaces still wired to v2 |
| Cross-space artifacts | base64 registration paths in federation/cross-space handlers |
| Persistence | migration or schema rows that exist only for v2 checkpoint state |
| Tests | `nested-resolve`, `graph`, `run-capacity-races`, `flow-call-acl`, `attach`, `resolve-step`, `advance-runner`, `first-week-setup`, `deprecated-removed`, `checkpoint.test.ts`, `checkpoint-resolve.json` skill-eval, v2-only conformance fixtures |

**Work:**

1. Inventory every production reference to `action:invoke`, `gate:resolve`, `isDeclarativeCheckpointStep`, `on_resolve` routing used only for v2 checkpoints, and base64 artifact registration.
2. Delete or rewrite to the clean `step:resolve` + branch-contract model; migrate any still-needed behavior to the Task 08 nested loop or Task 03 gate-free resolution paths.
3. Remove the `mrmr action invoke` command group and scrub CLI help, skills, and docs-proof fixtures.
4. Delete or rewrite the v2-only test suite; add strict rejection tests proving removed capabilities/commands/routes fail at boundaries.
5. Extend `scripts/check-clean-state.mjs` (or a sibling guard) to forbid `action:invoke`, `gate:resolve`, `isDeclarativeCheckpointStep`, and checkpoint-era MCP tool names in production source and active guidance.

**Already removed (do not reintroduce):** `murrmure_complete_action`, `wait_for_gate`, `resolve_gate` MCP tools.

### Lane B — `@murrmure/cli` typecheck debt (17 errors)

**Baseline at Task 13/14 review (HEAD after Task 14):**

| Count | Location | Issue |
|---:|---|---|
| 5 | `node_modules/electrobun/.../native.ts` | `Cannot find name 'self'` — dependency/lib typing |
| 1 | `src/lib/space-directory.ts:151` | missing `run_policies` on handlers file shape |
| 1 | `src/lib/space-doctor.ts:858` | `GlobalFlags \| {}` not assignable to `GlobalFlags` |
| 1 | `src/lib/view-dev.ts:175` | `ChildProcess` stdin nullability |
| 1 | `test/docs-proof.test.ts:269` | fixture missing `run_policies` |
| 1 | `test/docs-proof.test.ts:523` | missing declaration for `fdk-docs-scan.mjs` |
| 1 | `test/flow-help.test.ts:29` | `CommandDef` generic mismatch |
| 2 | `test/preview-review-v2-example.test.ts:299` | empty tuple / `dispatch` on `never` |
| 1 | `test/space-apply.test.ts:12` | `SpaceApplyBundle` export removed from hub-core |
| 3 | `test/space-doctor*.test.ts` | `RequestInfo` not in scope |

**Work:**

1. Fix application and test drift introduced by Tasks 08/09/12 (`run_policies`, `SpaceApplyBundle`, doctor tests).
2. Resolve the `electrobun` `self` typing issue via the smallest correct change (pin, `skipLibCheck` scope, ambient types, or dependency patch) — not a repo-wide `skipLibCheck` unless already the established pattern.
3. Delete or rewrite `preview-review-v2-example.test.ts` if Lane A/C retires the v2 example entirely; otherwise update it to a v3 fixture or mark the file excluded with an explicit guard.
4. Prove `pnpm --filter @murrmure/cli typecheck` and `pnpm -r typecheck` exit 0.

### Lane C — v2 tutorial and bridge documentation cutover

**Depends on:** Lane A (docs must describe the code that ships).

**Remove, archive, or rewrite:**

| Kind | Paths |
|---|---|
| v2 tutorials | `apps/docs/guide/tutorials/01-local-preview-review/**`, `02-multi-agent-brief/**`, `03-daily-brief-trigger/**` |
| Legacy bridges | `studio-specs/current/bridges/action-invoke.md`, `flow-engine.md`, `triggers.md`, `artifacts.md` (rev-1 §7 and other v2-only sections), plus stale sections in `desktop/spec.md`, `http-api.md`, `mcp-tools.md` if they still describe `action:invoke` / gate/checkpoint flows as current |
| Navigation | `apps/docs/.vitepress/config.ts`, `apps/docs/guide/tutorials/index.md` — v2 entries archived or redirected; Tutorial v3 `1a` remains `start here` |
| Phase tracker | `studio-specs/current/product/spec.md:1391` — clarify or archive the phase-08 `space onboard` row (historical record, not a current command) |
| v2 examples | `test-utils/spaces/preview-review-v2/**`, `packages/cli/test/preview-review-v2-example.test.ts` if no longer needed after Lane A/B |

**Work:**

1. Move v2 tutorials to a marked non-normative archive **or** delete them with changelog/release notes explaining Tutorial v3 supersedes 1b/2/3.
2. Rewrite remaining bridge pages to the clean protocol or delete pages whose sole purpose was v2 `action:invoke` / gate routing.
3. Update `studio-specs/current/index.md`, acceptance rows, and any cross-links that still point at v2 tutorials as active guidance.
4. Extend docs-proof and `check:clean-state` to reject v2 vocabulary in active surfaces (`awaiting_human`, `useViewSubmit`, `contract_keys`-keyed handler dispatch as the primary model, base64 artifact upload, `mrmr action invoke`).
5. Sync root `CHANGELOG.md` with the v2 runtime and docs removal.

## Testing

### Automated

- Full repository `pnpm -r typecheck` — **must pass** (Lane B done gate).
- Full unit/integration/E2E suite after Lane A removal; no v2-only tests asserting removed behavior unless they are strict rejection tests.
- Repository absence guards for Lane A removed patterns (capabilities, CLI command, checkpoint helpers, base64 registration).
- Docs-proof for Tutorial v3 and all affected references/skills after Lane C.
- Tutorial v3 progressive suite (`pnpm vitest run tutorial-v3`) — no regressions from runtime teardown.
- Task 14 release guards (`tutorial-v3-release.test.ts`) remain green; extend `manual-acceptance.schema.json` task pattern to `15` if this task records acceptance evidence.

### Manual

- Search CLI/Desktop help and active docs for `action invoke`, `gate:resolve`, checkpoint vocabulary, and v2 tutorial commands.
- Follow Tutorial v3 Parts 1–6 as a first-time user after Lane C navigation changes.
- Exercise one invalid legacy request per removed surface (CLI, HTTP, MCP if applicable) and verify immediate clear rejection.

## Documentation, skills, specs, and ADRs

- **ADRs:** update supersession links if Lane A removes checkpoint-era decisions; create a new ADR only if Lane A establishes a durable boundary not already covered by ADR-015 (nested loop) and Task 13 removals.
- **Normative specs:** complete sweep of `studio-specs/current/` for gate/checkpoint/`action:invoke`/base64 language; delete or rewrite bridges listed in Lane C.
- **User docs:** Tutorial v3 index/Parts 1–6, quick start, creating flows, handlers, agents MCP, troubleshooting, known gaps; archive or remove v2 tutorial trees.
- **Skills:** remove `action invoke`, gate-resolve, and checkpoint examples from `skill-agent` and `skill-developer`.
- **Scaffolds/examples:** delete or archive v2-only fixtures; ensure tutorial v3 scaffolds still generate.
- **Enforcement:** extend `check-clean-state`, docs-proof, and forbidden-pattern matrix for Lane A/C vocabulary.
- **Changelog:** v2 runtime removal, CLI typecheck fix, v2 docs archival, and any local reset impact.
- **Plans:** mark Tasks 13–14 deferred blockers closed; update this task handoff; archive coordinating-plan T15 remainder when done.

## References

- [Task index](./README.md)
- [Task 13 deferred blockers](./13-clean-slate-cutover.md#blockers-return-to-owning-task-not-opaque-patches-here)
- [Task 14 partial approval](./14-release-through-tutorial.md)
- [Coordinating plan T15](../2026-07-13-tutorial-v3-full-alignment.md)
- [Murrmure documentation sync rule](../../../.cursor/rules/murrmure-doc-sync.mdc)
- [Current specs index](../../current/index.md)

## Done gate

- Lane A: `action:invoke`, `gate:resolve`, v2 checkpoint/`on_resolve`/`goto` routing machinery, base64 cross-space registration, and `mrmr action invoke` are absent from active production surfaces and rejected at input boundaries.
- Lane B: `pnpm -r typecheck` exits 0; the 17-error `@murrmure/cli` baseline is cleared without hiding errors repo-wide.
- Lane C: v2 tutorials and legacy bridges are archived with non-normative marking or removed; active docs, navigation, and `studio-specs/current/` describe only the clean protocol; Tutorial v3 remains `start here`.
- Tasks 13 and 14 full done gates are satisfiable without the three deferred blockers.
- Tutorial v3 progressive suite and Task 14 release guards pass.
- No normative/tutorial/code/skill/scaffold drift remains for the removed v2 surface.

## Handoff

| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | glm-5.2-max | complete | Cleared all 17 `@murrmure/cli` typecheck errors at `5e694c7`. Fixes: `electrobun.d.ts` ambient `self`; `run_policies: []` in `space-directory.ts` + docs-proof fixture; `space-doctor.ts` `GlobalFlags` default; `view-dev.ts` `ChildProcessByStdio` typing; `fdk-docs-scan.d.mts`; `flow-help.test.ts` `CommandDef` cast; `preview-review-v2-example.test.ts` mock typing; `space-apply.test.ts` imports `SpaceApplyBundle` from contracts; `space-doctor*.test.ts` uses `string \| URL \| Request`. | `pnpm --filter @murrmure/cli typecheck` exit 0; `pnpm -r typecheck` exit 0 (18/18); affected CLI tests 77 passed + 1 skipped. | Review |
| review | review | gpt-5.6-sol-high | approved | Re-reviewed `5e694c7`. All 17 baseline errors addressed without repo-wide `skipLibCheck`. CLI + all workspace typechecks green. Patch hygiene clean. | Independent `tsc --noEmit` per workspace; `check:clean-state` OK. | Lane B done. Proceed Lane A continuation. |

### Lane ownership (for parallel execution)

| Lane | Owner task | May start after | Blocks |
|---|---|---|---|
| A — legacy v2 runtime | 15 | Task 14 merge | Lane C |
| B — CLI typecheck | 15 | Task 14 merge | full `pnpm -r typecheck` gate |
| C — v2 docs + bridges | 15 | Lane A merge | active guidance correctness |
