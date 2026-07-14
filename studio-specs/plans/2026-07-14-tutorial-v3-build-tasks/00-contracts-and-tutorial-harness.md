# 00 — Freeze contracts and build the tutorial harness

**Status:** Complete
**Build order:** 00  
**Depends on:** none  
**Source work packages:** T00, T01

## Goal

Turn the settled refinement decisions into durable architectural records and an executable, progressive Tutorial v3 fixture so every later task can ship against one contract and one manual acceptance path.

This is the only intentionally enabling task. It must not implement speculative product behavior or preserve current APIs that the clean target removes.

## User stories

- As an implementer, I can import or reference one canonical contract instead of interpreting prose independently.
- As a reviewer, I can evaluate later slices against approved decisions and explicit ownership.
- As a tutorial reader, every behavior-defining snippet is checked against an executable fixture.
- As a release operator, I can run one progressive suite and identify the first failing tutorial beat.

## Contracts

- Freeze the clean-slate decisions in the coordinating plan as accepted inputs; remove the stale “architecture gate open” status.
- Name one owner and canonical package for each shared contract:
  - normalized flow/step/branch contract;
  - `BranchResolveContract`;
  - handler alias and canonical identity;
  - run/open-step/resolver projection;
  - View host protocol;
  - upload intent and artifact reference;
  - connection descriptor and local credential lookup;
  - run scratch path API;
  - agent prompt protocol.
- Define stable tutorial fence IDs and extraction rules:
  - YAML/JSON compare structurally after canonical normalization;
  - shell, TypeScript, and executable text compare byte-for-byte;
  - missing or duplicate IDs fail.
- Define the manual acceptance record schema: task, tutorial chapters, environment, product build, commands, run IDs, evidence, result, and blockers.
- Preserve the rule that focused plans provide detail but this task backlog owns execution scope and order.

## Implementation

- Create `test-utils/spaces/tutorial-v3/` with progressive snapshots for Parts 2, 3, 5, and 6.
- Add shared temporary Hub, user-data, space, Git repository, fake-agent, and packaged-app helpers.
- Register all Tutorial v3 pages in docs-proof.
- Add skeleton test suites for contract, HTTP, MCP, CLI, View, handler, repository, shell UI, and packaged execution. Assertions activate with their owning task; do not merge expected failures.
- Use the real MCP bridge for tutorial agent E2E. Keep exhaustive branch/validation cases at the canonical domain service and cover HTTP separately.
- Record hot-file ownership and merge dependencies in this backlog and the coordinating plan.

## Testing

### Automated

- Fence extraction rejects missing IDs, duplicate IDs, missing fixture targets, and drift.
- Fixture stages strict-parse with the currently declared target schema; tests not yet implemented remain structurally present but skipped with an owning task ID, never expected-failing.
- Helpers prove isolation between temporary user data, space roots, run roots, repositories, and credentials.
- Architecture consistency tests fail when consumers redefine shared branch or resolver projection types.

### Manual

- Walk Parts 1–6 as a document review and map every command/result to a fixture or a named packaged-only check.
- Confirm the tutorial contains no unstated setup, hidden file, or unexplained placeholder.
- Threat-model View mutation, upload, shell interpolation, connection credentials, and repository mutation with the named owning tasks.

## Documentation, skills, specs, and ADRs

- **ADRs required:** create an ADR index/decision packet that links the owning ADRs required by Tasks 01–12. It may summarize decisions but must not duplicate their normative contracts.
- **Normative specs:** update `studio-specs/current/acceptance.md` with progressive tutorial and manual-evidence requirements.
- **Plans:** mark the coordinating plan ready for task execution and link this directory from `studio-specs/plans/README.md`.
- **Tutorial:** add stable IDs without changing the intended prose or behavior.
- **Skills:** no semantic change; point test-author guidance at canonical fixture paths where useful.
- **Enforcement:** extend `packages/cli/test/docs-proof.test.ts` and add tutorial-v3 suite registration.
- **Changelog:** none for harness-only work.

## References

- [Coordinating plan](../2026-07-13-tutorial-v3-full-alignment.md), especially T00–T01 and refinement decisions.
- [Tutorial v3](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/)
- [Plans index](../README.md)
- [Current acceptance spec](../../current/acceptance.md)

## Done gate

- The coordinating plan no longer presents settled architecture as open.
- Every shared contract has one owner and canonical location.
- Every tutorial beat maps to an executable assertion or a named manual-only packaged check.
- Docs-proof detects snippet drift.
- Later tasks can activate focused assertions without creating another fixture or redefining a contract.

## Delivery record

- Canonical ownership and the Tasks 01–12 decision index are accepted in
  [ADR-005](../../ADR/ADR-005-tutorial-v3-contract-ownership.md).
- Progressive Parts 2, 3, 5, and 6 snapshots, fence registry, beat map, and the
  manual evidence schema live under `test-utils/spaces/tutorial-v3/`.
- Shared snapshot/materialization, Hub, user-data, space, Git, fake-agent, and
  packaged-app helpers live under `test-utils/tutorial-v3/`.
- Contract, HTTP, MCP, CLI, View, handler, repository, shell UI, and packaged
  suites are present. Pending behavior assertions use `test.skip` and name their
  owning build task.
- All seven Tutorial v3 pages are registered in docs-proof. Registered fences
  compare structurally for YAML/JSON and byte-for-byte for executable text/code.
- Hot-file and documentation leases are recorded in the ordered backlog and the
  coordinating plan.
- Changelog is unaffected because this slice establishes contracts and test
  infrastructure without shipping runtime behavior.

## Handoff
| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | gpt-5.6-sol-high | complete | Accepted ten canonical contract owners; added the progressive fixture, isolated helpers, fence/beat/evidence contracts, nine skipped owned suites, ADR index, and synchronized specs/plans/tutorial/skill guidance. | `pnpm --filter @murrmure/cli test tutorial-v3-harness docs-proof` (28 passed); focused Tutorial suites (8 passed, 25 skipped); MCP suite (3 owned skips); contract ownership test (1 passed, 3 skips); `pnpm check:docs-proof` reached the pre-existing `check:known-gaps` drift gate before docs-proof. | review |
| review | review | glm-5.2-max | approved | Done gate satisfied across all five bullets; harness, fence drift detection, helper isolation, owned `test.skip` suites, ADR-005 ten-owner table, and 7-page docs-proof registration verified green; scope clean — commit `aa163a0` touches only fixtures/harness/skeleton tests/docs/specs/skill pointer, no runtime `src/` implementation. | `pnpm --filter @murrmure/cli test tutorial-v3-harness docs-proof` → 28 passed; `pnpm exec vitest run tutorial-v3` → 8 passed, 25 skipped (9 files); `pnpm --filter @murrmure/mcp-bridge test tutorial-v3-mcp` → 3 owned skips; harness proves fence drift/duplicate/missing-target rejection, isolation of user/credentials/spaces/runs/repos, skeleton-skip + no-`test.fails`/`todo`/`describe.skip` guard, and Parts 1–6 beat coverage. Non-blocking observation: `BranchResolveContract`/`OpenStepResolverProjection` are not yet defined in `packages/**/src`, so the Task 00 contract-ownership test is a forward guard that passes vacuously now and fires on redefinition once Tasks 03/04/05 land the canonical types — acceptable for an enabling slice. Pre-existing `check:known-gaps` drift gate is unrelated to Task 00. | task-01 |

