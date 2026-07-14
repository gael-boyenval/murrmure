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

