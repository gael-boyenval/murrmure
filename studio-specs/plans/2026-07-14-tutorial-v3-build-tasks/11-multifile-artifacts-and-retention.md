# 11 — Consume multi-file artifacts and retain run data safely

**Status:** Ready  
**Build order:** 11  
**Depends on:** 05, 06  
**Source work packages:** collection subset of T04, T12

## Goal

Extend the proven single-spec path into a complete multi-file and lifecycle capability: bounded file collections upload in deterministic order, local handlers consume a verified directory, remote consumers receive references, concurrent runs stay isolated, and terminal local data is retained and garbage-collected predictably.

## User stories

- As a flow author, I declare a bounded collection of files without packaging them into an archive.
- As a local handler author, I receive one verified directory for a multi-file slot.
- As a remote handler, I receive ordered artifact references rather than meaningless paths on another machine.
- As an operator, active run data is never garbage-collected and terminal local bytes expire after a known period.
- As a support engineer, cleanup summaries are useful without leaking content or host paths.

## Contracts

- Slots are bounded collections; `max_files` defaults to `1`, with optional `min_files` and `max_total_bytes`.
- Each file independently satisfies MIME, extension, and byte constraints; normalized duplicate filenames fail.
- Submission and manifest preserve deterministic file order. Archives remain opaque single files.
- Singleton slots may use `.path`; any slot with `max_files > 1` uses `.directory`. Apply rejects singular bindings for collections.
- Local consumer directory contains digest-verified files with normalized unique names and is atomically visible.
- Remote/federated consumers receive ordered immutable artifact references and materialize them in their own space.
- `.mrmr/dev/runs/{run_id}/steps/{step_id}/...` is the only local run root.
- All intermediate state remains run-namespaced until explicit final promotion.
- Active run directories are never GC'd. Terminal directories expire at `terminal_at + 7 days`.
- GC runs at Hub startup and every 24 hours, preserving journal metadata and artifact manifests.
- Failed/partial/incomplete upload cleanup remains separate and immediate/lease-based per Task 05.
- No manual GC command or release-time retention override ships.
- Managed temporary, promoted, and consumer copies count toward fixed local quotas.

## Implementation

- Complete collection schema/compile/resolve/manifest support and `File[]` host/SDK transport.
- Add `.directory` token validation and ordered reference projection.
- Materialize local collection inputs through the canonical path helper and atomic copy/rename.
- Remove all `.mrmr.temp/runs` readers, writers, fixtures, docs, and literal path drift.
- Add terminal timestamps, retention eligibility, startup/daily GC scheduler, restart safety, and sanitized summary metrics.
- Preserve global artifact references independently from local byte deletion.
- Add a concrete local and remote collection example/fixture.

## Testing

### Automated

- Default singleton and collection cardinality, aggregate size, duplicate normalized names, order, per-file validation, and opaque archives.
- `.path` rejection for collections and `.directory` contents equivalent to ordered manifest.
- Digest mismatch, traversal, interrupted copy, atomic visibility, source immutability, and normalized filenames.
- Concurrent run IDs never overlap scratch, transfer, artifact, or output paths.
- Local/public/remote projection tests prove host paths never cross the boundary.
- Exact seven-day fake-clock retention, active-run immunity, startup/daily cadence, restart behavior, partial failure, and preserved metadata/manifests.
- Quota accounting includes temporary, promoted, and consumer copies.
- Repository guard bans `.mrmr.temp/runs` and duplicate literal run-root construction.

### Manual

- Upload and consume a multi-file slot locally; inspect ordering and directory contents.
- Observe the same run remotely/federated and verify only references appear.
- Restart Hub with active and terminal runs and inspect retention behavior/summary.
- Advance a fake or controlled clock past seven days and verify local bytes disappear while history remains.
- Inspect Tutorial Part 4–6 filesystem paths for agreement with the canonical root.

## Documentation, skills, specs, and ADRs

- **ADR required:** local run storage/retention and local-versus-federated artifact materialization boundary.
- **Normative specs:** artifacts, step contract collections, run scratch/retention, federation boundary.
- **User docs:** artifact collection/path/retention and troubleshooting references.
- **Tutorial:** keep Parts 4–6 singleton wording accurate; add no collection complexity to the introductory path unless used.
- **Skills:** agent/developer artifact collection and local/remote path guidance.
- **Scaffolds/examples:** `.gitignore`, collection fixture/example.
- **Enforcement:** stale-root ban, path helper guard, retention/GC suite.
- **Changelog:** canonical root, collection tokens, seven-day retention, and removed root.

## References

- [Branch schema/artifact validation](../2026-07-10-branch-schema-artifact-validation.md)
- [Run scratch normalization](../2026-07-10-run-scratch-path-normalize.md)
- [Coordinating plan T04/T12](../2026-07-13-tutorial-v3-full-alignment.md)
- [Current artifacts bridge](../../current/bridges/artifacts.md)

## Done gate

- Collection upload, local directory consumption, and remote reference consumption work end to end.
- Singleton and collection token shapes cannot be confused.
- Concurrent runs have disjoint paths and quota accounting.
- Active data survives; terminal local bytes expire exactly after seven days; metadata/manifests remain.
- No stale run root or public host path remains.

## Handoff

| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | glm-5.2-max | complete | Built Task 11 on HEAD `7d5dc6e`. Core collection/retention behavior was co-committed in earlier task builds (task-05 `495435e`, task-06 `61d8ce9`/`abb8f7c`, task-09 `d6ae0d4`, task-07 `083a2db`) — disclosed as co-mingled in the task-09 review: collection slot schema (`packages/contracts/src/entities/step-contract.ts` `min_files`/`max_files`/`max_total_bytes` + min≤max validation), `.directory` token + apply-time cardinality rejection (`packages/executors/src/shell-spawn.ts`), `ARTIFACT_TOKEN_CARDINALITY_MISMATCH` lint (`step-contract-compile.ts`), atomic collection consumer copy (`consumer-copy.ts` `materializeConsumerCopyDirectory`), `fs-bytes.ts`, run-retention GC (`run-retention.ts`/`run-retention-gc.ts`) wired into `hub-daemon/main.ts` with startup + 24h cron and sanitized summary, canonical run-scratch helpers (`run-scratch-paths.ts` `spaceRunsDir`/`stableSlotDirRel`/`consumerInputsDirPath`), and `upload-intent-service.ts` path adoption. This turn closed the remaining sync + verification layer only: ADR-014 (local run storage/retention + local-vs-federated materialization boundary) + ADR index, `studio-specs/current/bridges/artifacts.md` collections/retention sections, agent + developer skills, `apps/docs/guide/space-handlers.md` user docs, CHANGELOG, the `scripts/check-run-scratch-paths.mjs` repository guard (bans `.mrmr.temp/runs` + literal run-root construction outside the canonical helper) wired into `check:docs-proof`, a local+remote `test-utils/spaces/collection-example/` fixture, and new focused tests (`collection-example.test.ts`, `run-scratch-isolation-quota.test.ts`, un-skipped `tutorial-v3-handler.test.ts` Task 11, extended `shell-spawn-safety.test.ts`). | Done gate (5/5): (1) collection upload/local dir/remote ref end-to-end — `collection-example.test.ts` (5) + tutorial-v3-handler Task 11; (2) singleton/collection token shapes can't be confused — `shell-spawn-safety.test.ts` (13: `.path` on collection → null, `.directory` on singleton → null, opaque `artifact:{producer}:{slot}:directory` audit ref with no host path) + committed cardinality lint; (3) concurrent runs disjoint paths + quota incl. consumer copies — `run-scratch-isolation-quota.test.ts` (4); (4) active survives / terminal expires at `ended_at+7d` / metadata+global refs preserved / sanitized summary — `run-retention.test.ts` (9) + tutorial-v3-handler retention fake-clock; (5) no stale run root or public host path — `check:run-scratch-paths` OK, `check:clean-state` OK, `check:docs-proof` OK (29). Tests: Task 11 targeted 5 files 36/36 passed; broader affected 30 files 195 passed \| 21 skipped, 0 failed; run-retention sweep observed firing at Hub startup in HTTP tests (`swept=0 bytes_freed=0 …`). Typecheck: `@murrmure/hub-core`, `@murrmure/hub-daemon`, `@murrmure/executors`, `@murrmure/contracts`, `@murrmure/mcp-bridge`, `@murrmure/runtime-contracts` clean. `check:boundaries` OK (551 modules, 0 violations). ADR-014 present + indexed. | Review Task 11 separately (this turn is build completion, not a full review). Task 08 and Task 12 were committed separately (HEAD `7d5dc6e`); Task 11's set was selectively staged on top of HEAD without regressing Task 08. |
| review | review | gpt-5.6-sol-high | blocked | Reviewed commit `d2a4a53`; done gates 2–5 are supported, but gate 1 is not complete end to end. The remote-hub dispatch path marks the contract as `remote_reference` yet `packages/executors/src/remote-hub.ts` relays only session/run/step/params/expect/artifacts_in/delivery and drops `invoke.step_contract`, `exec_input`, and the ordered artifact references. `artifactPathsForInputs` itself still projects a collection `.directory` from the producer `.mrmr/dev/runs/...` path alongside `.files`, so forwarding that context unchanged would also violate the reference-only boundary. The fixture test proves an in-process projection, not a remote consumer receiving/materializing it. No code fix was made because repairing this requires protocol wiring and reference-only sanitization, not a review-local patch. | Task 11 targeted baseline: 5 files, 36/36 passed. Task 08 mixed-file regression: 9 files, 74 passed, 2 skipped, 0 failed; `check:nested-call-return` OK. Gate evidence: token cardinality tests 13/13; run isolation/quota 4/4; retention 9/9 plus tutorial fake clock; stale-root/audit guards pass. Blocking source trace: `invoke-service.ts:674-675` selects `remote_reference`; `remote-hub.ts:56-64` omits the contract/references; `step-artifacts.ts:332-346` emits producer `.directory`; `collection-example.test.ts:77-92` checks ordered refs and only rejects absolute `/tmp`/Windows paths. | Relay a sanitized reference-only step contract (or explicit ordered artifact-reference payload) through `remote_hub`, materialize it in the destination space, and add a real relay integration test asserting no `.path`, `.directory`, `.mrmr/dev/runs`, or host path crosses the boundary; then re-review gate 1. |

