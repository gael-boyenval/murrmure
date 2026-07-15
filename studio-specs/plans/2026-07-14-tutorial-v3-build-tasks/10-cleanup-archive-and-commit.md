# 10 — Archive and commit only workflow-owned outputs

**Status:** Ready  
**Build order:** 10  
**Depends on:** 06, 07, 09  
**Source work packages:** T13

## Goal

Complete Tutorial Part 6 safely: after a successful build, the cleanup handler verifies repository state, archives the submitted specification, stages only workflow-owned outputs, commits them, and records the commit result without teaching broad staging or platform-level Git orchestration.

## User stories

- As a repository owner, the workflow never commits unrelated or sensitive files.
- As a user, the submitted specification is preserved in repository history and as an immutable run artifact.
- As an operator, I can audit the staged paths, archive path, and commit SHA.
- As a user with a dirty repository, the tutorial fails before mutation with clear recovery instructions.
- As a maintainer, normal Git failures remain simple handler failures rather than a second recovery engine.

## Contracts

- Git cleanliness is tutorial/space policy, not a Hub schema or product-wide Git rule.
- The first repository-mutating handler checks staged, unstaged, and non-ignored untracked files before mutation.
- `.mrmr/dev` is ignored and never staged.
- The tutorial flow relies on Task 09's `max_concurrent_runs: 1`; no Git worktree management is added.
- Intermediate files remain run-namespaced until explicit final repository promotion.
- Replace `git add -A` with an allowlisted pathspec derived from workflow-owned outputs.
- Commit `specs/archive/{run_id}.md` plus allowlisted implementation outputs.
- Original upload remains an immutable run artifact outside Git.
- Validate commit subject/body before process creation and pass them through safe complete-argument interpolation.
- Cleanup output includes commit SHA, staged paths, and archive path and is journaled.
- Archive collision, missing identity, non-Git directory, no-op, or commit failure exits nonzero through normal handler/run failure. No rollback, retry, compensation, or special recovery state.

## Implementation

- Add tutorial-owned clean-worktree preflight script/handler.
- Materialize/archive the run's submitted spec at the run-ID path.
- Derive and enforce the exact staging allowlist.
- Wire prior build output into validated commit message fields.
- Return structured cleanup output and persist it in normal step/journal state.
- Update temporary Git test helpers and exact tutorial fixture.
- Keep all Git-specific policy outside Hub contracts/runtime.

## Testing

### Automated

- Temporary-repository happy path checks exact archive content, staged path set, commit subject/body, and SHA.
- Dirty staged, unstaged, and non-ignored untracked cases fail before any mutation.
- `.mrmr/dev`, unrelated files, credentials, and ignored paths never enter the index.
- Original run artifact remains immutable and archive copy is committed.
- Shell metacharacters and multiline-safe commit data remain literal.
- Missing identity, non-Git directory, collision, no-op, and commit failure produce ordinary nonzero handler/run results.
- Two-start attempt is denied by Task 09 before repository mutation.

### Manual

- Execute Tutorial Part 6 verbatim from a clean repository.
- Inspect `git status`, commit diff, `specs/archive/{run_id}.md`, run output, and journal.
- Repeat with staged, unstaged, and untracked dirt; confirm no mutation.
- Trigger a commit failure and follow the simple documented recovery path.
- Try a benign commit message containing shell metacharacters.

## Documentation, skills, specs, and ADRs

- **ADR not required:** dirty-worktree and archive policy are tutorial-owned example behavior. Update existing handler/run-isolation ADRs only if platform contracts change.
- **Normative specs:** generic handler execution/audit and run isolation only; explicitly avoid a platform Git-cleanliness contract.
- **User docs:** safe repository automation guidance.
- **Tutorial:** Part 6 commands, checkpoints, expected diff, and troubleshooting.
- **Skills:** handler authoring for safe Git operations and staging allowlists.
- **Scaffolds/examples:** safe cleanup script/handler if exposed as an example.
- **Enforcement:** temporary-Git security/integration suite and ban on tutorial `git add -A`.
- **Changelog:** only platform-visible behavior; tutorial example changes need not become product claims.

## References

- [Coordinating plan T13](../2026-07-13-tutorial-v3-full-alignment.md)
- [Tutorial Part 6](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/06-cleanup-and-commit.md)
- [Safe shell task](./06-safe-spec-copy-handler.md)
- [Run capacity task](./09-run-capacity-and-apply-safety.md)

## Done gate

- The full tutorial run commits exactly the intended implementation files and run-ID archive.
- Dirty repository state fails before mutation.
- Original run artifact remains immutable and `.mrmr/dev` remains outside Git.
- Journaled cleanup output contains correct SHA, staged paths, and archive path.
- No worktree manager, broad staging, automatic rollback, or special Git protocol enters Murrmure.

## Handoff

| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | gpt-5.6-sol-high | complete | Built Task 10 at `4931de7`: activated the exact Tutorial Part 6 repository-conformance suite, added a temporary tutorial Git-repository harness, corrected per-file untracked-path enumeration in the frozen cleanup fixture and tutorial fence, and documented safe repository automation without adding platform Git orchestration. | Commit `4931de7`; repository conformance covers clean archival/allowlisted commit, dirty preflight, ignored immutable scratch, literal commit data, ordinary Git failures, run serialization, handler bindings, and the broad-staging ban. | Review Task 10. |
| review | review | gpt-5.6-sol-high | approved | Reviewed commit `4931de7` in the clean isolated Task 10 worktree. All five done-gate bullets are satisfied: the exact Part 6 cleanup commits the run-ID archive and only allowlisted implementation paths; staged, unstaged, and non-ignored untracked dirt fails in the first mutating handler before repository mutation; the producer artifact remains unchanged under ignored `.mrmr/dev`; structured cleanup output reports the real commit SHA, exact staged paths, and archive path for normal auto-completion journaling; and the tutorial adds no worktree manager, broad staging, rollback, or special Git protocol. | `pnpm vitest run packages/executors/conformance/tutorial-v3-repository.test.ts`: 1 file passed, 8/8 tests passed. `git diff 4931de7^ 4931de7 --check` passed; isolated review worktree was clean. | Task 10 approved. |

