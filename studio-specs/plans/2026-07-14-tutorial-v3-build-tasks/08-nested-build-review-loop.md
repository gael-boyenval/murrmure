# 08 — Run a nested build/review loop

**Status:** Ready  
**Build order:** 08  
**Depends on:** 07  
**Source work packages:** nested subset of T03, T05, T07, T11

## Goal

Deliver nested orchestration as a complete call/return capability: an open parent resolver activates one declared child, yields, receives the validated child result on resume, may iterate through another child, and eventually resolves its own contract.

## User stories

- As a flow author, a nested child returns control to its parent by default without resolving the parent.
- As a parent resolver, I can activate one declared child at a time and later decide whether to iterate or resolve.
- As an operator, journal state distinguishes child open, parent yield, child resolution, parent resume, and parent resolution.
- As an agent or View author, returned-child context is consistent across resolver types.
- As a security reviewer, stale parent assignments cannot mutate after yielding or open undeclared steps.

## Contracts

- Child branch with neither `route` nor `resume` resumes its immediate parent by default, including `failed`.
- `resume: <ancestor_step>` returns to an already-open ancestor; apply rejects self, unknown, non-ancestor, or closed targets.
- Immediate run failure requires explicit `route: { run: failed }`.
- Resume never opens or resolves the ancestor and never validates the ancestor's branch contract.
- Parent receives canonical returned-child identity, branch, iteration, payload, and artifact references.
- Parent resolver may call `murrmure_open_child_step({ run_id, parent_step_id, child_step_id, idempotency_key })`.
- Child activation accepts no arbitrary input, targets only declared children, and permits one active child per parent.
- Successful child open atomically yields the current parent assignment and revokes its mutation credential.
- Child return creates one fresh parent assignment with reason `resumed`; no duplicate `step.opened` and no overlapping old/new authority.
- Shell/script resume is a new process invocation. Agent-session reuse is optional adapter behavior. A View resolver refreshes context in place.
- Remove `complete_parent`, `continue_parent`, `goto`, and automatic parent completion.

## Implementation

- Add nested normalization/compiled routes and ancestor validation.
- Add canonical resume/yield journal events and returned-child projection.
- Implement idempotent, parent-scoped `murrmure_open_child_step` across domain, MCP, and authorized clients.
- Make child open, parent yield, credential revocation, and child dispatch one atomic transition.
- Reinvoke the same exclusive handler binding on resume with reason/context.
- Extend View context/host operation and agent prompt rendering for declared children and returned child.
- Remove old nested parent-completion/goto machinery.
- Add an executable nested build/review fixture or tutorial extension without changing the simple introductory path unnecessarily.
- Treat the nested fixture as release-blocking conformance even when it remains an advanced example rather than a required Part 1–6 reader action.

## Testing

### Automated

- Compile/apply tests for implicit immediate-parent resume, explicit ancestor resume, nested failed return, explicit run failure, and invalid targets.
- Parent activation authorization, undeclared target, arbitrary input rejection, one-active-child race, and idempotency mismatch.
- Atomic yield tests prove stale writes fail before child dispatch and only one fresh resumed assignment appears.
- No duplicate parent `step.opened`, no implicit parent resolution, and parent contract validation only on parent resolve.
- Shell fresh-process, optional agent-session reuse, and View in-place-refresh parity.
- Resumed prompt/View context includes exact returned-child data and declared children.
- Absence guards for `complete_parent`, `continue_parent`, `goto`, and automatic parent completion.

### Manual

- Run a parent build resolver that opens review, receives a requested-change result, opens another build/review iteration, and finally resolves itself.
- Observe journal and UI through every transition.
- Attempt a second active child, an undeclared child, stale parent mutation, and idempotency-key reuse with different arguments.
- Repeat once with an agent parent and once with a View parent.

## Documentation, skills, specs, and ADRs

- **ADR required:** nested step call/return, parent yield, and resolver resume semantics.
- **Normative specs:** step-contract control flow, handler resume lifecycle, MCP child activation, journal events.
- **User docs:** `creating-flows.md`, multi-agent/nested workflow guidance.
- **Tutorial:** keep Part 5 terminology consistent and link the executable advanced example if the introductory path does not demonstrate the loop. The advanced fixture remains a release gate either way.
- **Skills:** flow authoring, agent parent-resolver protocol, View child activation.
- **Scaffolds/examples:** nested build/review fixture.
- **Enforcement:** compile/runtime race, prompt/context parity, and removed-pattern guards.
- **Changelog:** nested call/return protocol and removed parent-completion vocabulary.

## References

- [Flow branch API simplification](../2026-07-10-flow-branch-api-simplify.md)
- [Default branches](../2026-07-10-step-default-branches.md)
- [Handler authoring simplification](../2026-07-10-handler-authoring-simplify.md)
- [Agent prompt protocol](../2026-07-10-agent-prompt-protocol-simplify.md)
- [Coordinating plan T03/T05/T07/T11](../2026-07-13-tutorial-v3-full-alignment.md)

## Done gate

- Parent/child iteration works through real resolvers and the canonical journal.
- Child return never resolves, reopens, or validates the parent.
- Successful child activation yields and revokes the old assignment atomically.
- Only declared children can open, one at a time, with deterministic idempotency.
- Agent, shell, and View resolver semantics differ only in adapter lifecycle, not protocol state.
- Removed nested-control vocabulary has no active path.
- The release suite executes the nested conformance fixture even if Parts 1–6 retain the simpler linear walkthrough.


## Handoff

| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | glm-5.2-max | complete | Built Task 08 at HEAD `1d4785c`. Nested call/return core behavior was co-committed in earlier task builds (task-05 `495435e`, task-06 `61d8ce9`/`abb8f7c`, task-07 `5301006`/`083a2db`, task-09 `d6ae0d4`, task-10 `4931de7`, task-12 `622aa77`/`1d4785c`) — disclosed as co-mingled in the task-09/task-11 reviews: `STEP_YIELDED`/`STEP_RESUMED` events (`event-types.ts`), `declared_children`/`returned_child`/`route`+`resume` superRefine (`step-contract.ts`), `yielded` memo status + `returned_child` projection (`run-step-memo.ts`/`run.ts`/`step-view-ref.ts`/`memo-from-step.ts`), child-open/yield/resume in `step-open.ts`/`step-resolve.ts`/`step-contract-compile.ts`/`step-contract-slice.ts`/`advance-runner.ts`/`apply-index.ts`, `transitionNestedChild` port+memory+sqlite, `murrmure_open_child_step` MCP handler/schema/registry + shell-client/shell-web/view-sdk `openChild` bindings, preview-review-v2 fixture (`flow.manifest.yaml` `resume: build`, `handlers.yaml` `murrmure_open_child_step`/`step.opened::preview-review.build.review`, feature-build SKILL nested loop, README), nested-resolve/graph/catalog-schema/tutorial-v3-contract tests, ADR-007/ADR-013 + flow-engine/handlers/step-contract bridges + product spec + tutorial Parts 2–6/creating-flows/multi-agent/review-workflow/mcp-tools/view-sdk docs + skill-agent mcp.md + skill-developer flow-authoring.md. This turn closed the remaining finishing layer only: `packages/hub-core/src/flow-engine/open-child-step.ts` + `packages/hub-daemon/src/routes/runs/open-child-step.ts`, ADR-015 + ADR index entry, `scripts/check-nested-call-return.mjs` repository guard (bans `complete_parent`/`continue_parent` + asserts `murrmure_open_child_step`/`returned_child`/`resume: build` markers) wired into `check:docs-proof` as `check:nested-call-return`, skill-agent `SKILL.md` nested section (replaced the stale engine-routed model with the call/return protocol), and the CHANGELOG Task 08 section. | Done gate (7/7): (1) parent/child iteration through real resolvers + canonical journal — `nested-resolve.test.ts` + `tutorial-v3-contract.test.ts`; (2) child return never resolves/reopens/validates parent — compile/apply tests in `step-contract-compile.test.ts`/`step-contract-slice.test.ts`; (3) atomic yield + credential revocation — `step-open.ts` + `nested-resolve.test.ts`; (4) only declared children, one active, deterministic idempotency — `step-contract-compile.test.ts` + `nested-resolve.test.ts`; (5) agent/shell/View differ only in adapter lifecycle — `app-bridge.test.ts`/`host.test.ts` + `preview-review-v2-example.test.ts`; (6) removed vocabulary has no active path — `check:nested-call-return` OK; (7) nested conformance fixture is release-blocking — `preview-review-v2` fixture + `tutorial-v3-handler` nested path. Tests: Task 08 focused 9 files — `@murrmure/contracts` 4 passed \| 1 skipped, `@murrmure/hub-core` 26 passed, `@murrmure/hub-daemon` 7 passed, `@murrmure/view-sdk` 29 passed, `@murrmure/cli` 8 passed \| 1 skipped = 74 passed \| 2 skipped, 0 failed (exceeds the 67 baseline). Guard: `check:nested-call-return — OK`. | Review Task 08 separately (this turn is build completion, not a full review). **Staging note:** the working tree carried substantial co-mingled Task 11 WIP; this commit stages ONLY Task 08. Task 11-only paths were excluded and left uncommitted for the task-11 commit: ADR-014, `test-utils/spaces/collection-example/`, `scripts/check-run-scratch-paths.mjs`, `run-scratch-isolation-quota.test.ts`, `collection-example.test.ts`, `bridges/artifacts.md`, `apps/docs/guide/space-handlers.md`, `packages/cli/skill-developer/SKILL.md` (collections/retention; nested content already in HEAD), `run-retention.ts`, `run-scratch-paths.ts`, `shell-spawn-safety.test.ts`, `tutorial-v3-handler.test.ts` (Task 11 retention test), and the `11-multifile-artifacts-and-retention.md` plan handoff. Mixed files were partial-staged to keep only Task 08 hunks: CHANGELOG (Task 08 section only), package.json (`check:nested-call-return` only), ADR README (ADR-015 only), skill-agent `SKILL.md` (nested section only). Non-blocking: `@murrmure/cli` typecheck has pre-existing debt at HEAD (unchanged by Task 08). |
| review | review | glm-5.2-max | approved | Reviewed clean commit `7d5dc6e` (Task 11 WIP stashed: ADR-014, `test-utils/spaces/collection-example/`, `scripts/check-run-scratch-paths.mjs`, `run-scratch-isolation-quota.test.ts`/`collection-example.test.ts`, `bridges/artifacts.md`, `apps/docs/guide/space-handlers.md`, `skill-developer/SKILL.md` collections/retention, `run-retention.ts`/`run-scratch-paths.ts`, `shell-spawn-safety.test.ts`, `tutorial-v3-handler.test.ts` Task 11 retention test, `11-multifile-artifacts-and-retention.md` handoff, and the Task-11 hunks left on the shared CHANGELOG/package.json/ADR-README/skill-agent files). All seven done-gate bullets satisfied in committed code. (1) Parent/child iteration through real resolvers + canonical journal — `open-child-step.ts` parent-scoped `withParentLock` + `STEP_YIELDED`; `step-resolve.ts` `resumeTargetFromRoutes` + `STEP_RESUMED` + `returned_child` projection; preview-review-v2 fixture `resume: build` loop; `nested-resolve.test.ts` + `tutorial-v3-contract.test.ts`. (2) Child return never resolves/reopens/validates parent — `step-resolve.ts:202-262` resume path only flips the ancestor `yielded`→`working` (reason `resumed`), reuses the same `step.opened::{key}` binding (no new `step.opened`), and never runs the parent branch contract; `isCatalogAncestor`/`RESUME_TARGET_NOT_ANCESTOR`/`RESUME_TARGET_NOT_OPEN` validate the resume request, not the parent; ADR-015 states it explicitly; `step-contract-compile`/`step-contract-slice` tests. (3) Atomic yield + credential revocation — `transitionNestedChild` is the atomic port transition (returns `ACTIVATION_CONFLICT` on stale parent memo), `cancelStepExecutor` + `revokeStepResolveCredentials` run before child `openStepContract` dispatch; `nested-resolve.test.ts`. (4) Only declared children, one active, deterministic idempotency — `CHILD_NOT_DECLARED`/`CHILD_ALREADY_ACTIVE`/`IDEMPOTENCY_MISMATCH`/deduplicated-exact-retry, parent-scoped lock, content-digest request hash; `step-contract-compile.test.ts`. (5) Agent/shell/View differ only in adapter lifecycle — ADR-015 (shell = new process + fresh credential, agent-session reuse optional, View = in-place host-context refresh); `app-bridge.test.ts` + `host.test.ts`. (6) Removed vocabulary has no active path — `check:nested-call-return — OK`; `complete_parent`/`continue_parent` absent from all source roots; step-contract `goto` rejected by the strict `.strict()` parser and listed in `REMOVED_STEP_KEYS`/`REMOVED_BRANCH_KEYS`. (7) Nested conformance fixture release-blocking — preview-review-v2 fixture + `preview-review-v2-example.test.ts` run under both `pnpm test` and `pnpm test:acceptance`; `check:nested-call-return` is wired into `check:docs-proof`; CI gates on every PR and push to main. Docs/ADRs synced: ADR-015 added + ADR-007/ADR-013 amended; flow-engine/handlers/step-contract bridges + product spec + tutorial Parts 2–6/creating-flows/multi-agent/review-workflow/mcp-tools/view-sdk + skill-agent `SKILL.md`/`mcp.md` + skill-developer `flow-authoring.md` + CHANGELOG Task 08 section. | Clean tree at `7d5dc6e` (Task 11 WIP stashed): 9 focused files = 74 passed \| 2 skipped \| 0 failed — `@murrmure/contracts` `tutorial-v3-contract` 4\|1 skipped; `@murrmure/hub-core` `step-contract-compile` 13 + `step-contract-slice` 13 = 26; `@murrmure/hub-daemon` `catalog-schema` 2 + `graph` 1 + `nested-resolve` 4 = 7; `@murrmure/view-sdk` `app-bridge` 11 + `host` 18 = 29; `@murrmure/cli` `preview-review-v2-example` 8\|1 skipped. Guard: `node scripts/check-nested-call-return.mjs` → `check:nested-call-return — OK`. Spot checks on the `7d5dc6e` tree: `open-child-step.ts` keyed critical section + `revokeStepResolveCredentials`/`cancelStepExecutor` before `openStepContract`; `step-resolve.ts:202-262/464-479` resume-only ancestor transition + ancestor validation; `step-contract-compile.ts:51-74` `REMOVED_STEP_KEYS`/`REMOVED_BRANCH_KEYS` incl. `goto`; `step-contract.ts:65` `.strict()` branch schema; preview-review-v2 `flow.manifest.yaml` `resume: build` (no checkpoint `goto`); `.github/workflows/ci.yml` runs `pnpm test` + `test:acceptance` + `check:docs-proof`. | Proceed to next task per plan order. Non-blocking follow-ups (not Task 08): `check:nested-call-return` asserts `complete_parent`/`continue_parent` absence and required markers but not `goto` absence — intentional, because `goto` legitimately remains in (a) rejection-list constants (`step-contract-compile.ts:61/70`, `step-contract.ts:62`) and (b) the legacy `on_resolve` checkpoint flow-routing machinery (`manifest.ts:49`, `checkpoint-runner.ts`, `checkpoint-resolve.ts`, `engine-capabilities.ts`, `checkpoint.test.ts`); that pre-step-contract mechanism's clean-slate removal is Task 13's scope, not nested control. `@murrmure/cli` typecheck pre-existing debt at HEAD (unchanged by Task 08); `app-bridge.test.ts` emits React `act(...)` env warnings (pre-existing JS env noise, tests pass). |
