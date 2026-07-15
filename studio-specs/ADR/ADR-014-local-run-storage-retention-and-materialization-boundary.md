# ADR-014 — Local run storage retention and local-vs-federated artifact materialization

**Status:** Accepted
**Date:** 2026-07-15
**Owners:** Hub core, Executors
**Task:** [Tutorial v3 Task 11](../plans/2026-07-14-tutorial-v3-build-tasks/11-multifile-artifacts-and-retention.md)
**Supersedes the run-scratch section of:** [run-scratch-path-normalize](../plans/2026-07-10-run-scratch-path-normalize.md)

## Context

Task 06 shipped a singleton artifact path: one spec file uploaded, promoted
under the run tree, and consumed as a verified run-scoped copy. Task 11 extends
that to a complete multi-file and lifecycle capability. Two architectural
questions had to be settled before code:

1. **Where does local run data live, and when does it expire?** Run scratch,
   promoted artifacts, consumer copies, and transfer materializations had
   accumulated under `.mrmr/dev/runs/{run_id}/`, but retention was undefined.
   Operators could not predict when terminal local bytes would be reclaimed,
   and there was no rule protecting active runs from cleanup.

2. **What does a consumer receive — bytes or references — and where is the
   boundary between a local handler and a remote/federated one?** A local
   handler can read a directory on the same machine. A remote consumer cannot
   use a path on another machine's filesystem; it needs ordered immutable
   references it materializes in its own space. The singleton `.path` token
   did not generalize to a bounded collection, and conflating the two token
   shapes would let a handler accidentally bind a collection as a single path.

## Decision

### 1. One canonical local run root with 7-day terminal retention

- `.mrmr/dev/runs/{run_id}/` is the **only** local run-scratch root. It is
  constructed exclusively by `runScratchDir` / `spaceRunsDir`
  (`packages/hub-core/src/flow-engine/run-scratch-paths.ts`). No other code
  constructs the literal path; a repository guard
  (`scripts/check-run-scratch-paths.mjs`) bans `.mrmr.temp/runs` and duplicate
  literal run-root construction. `.mrmr.temp/inbox` cross-space exchange and the
  `space-doctor` legacy-root cleanup list are separate concepts and unaffected.
- **Active run directories are never garbage-collected.** A run is active while
  its lifecycle is `working` or `input-required`.
- **Terminal local bytes expire at `ended_at + 7 days`.** A run is terminal when
  its lifecycle is `completed`, `failed`, or `cancelled` and it has an
  `ended_at` timestamp. The boundary is inclusive: a run is eligible exactly at
  `ended_at + 7 days` (one millisecond earlier it is retained).
- GC runs at **Hub startup and every 24 hours** (`registerRunRetentionGc`). It
  removes only the per-run tree; journal metadata, run rows, and global artifact
  manifests/references live in the persistence store and the shared exchange
  tree (`.mrmr/dev/inbox`, `dataDir/exchanges`), which are **preserved
  independently** of local byte deletion. Partial removal failure is tolerated:
  a failed tree is left for the next sweep rather than aborting the pass.
- **No manual GC command or release-time override ships.** Failed/partial/
  incomplete upload cleanup remains separate and immediate/lease-based per
  Task 05.
- The retention sweep returns a **sanitized summary** (counts and freed bytes
  only — no run ids, space ids, or host paths) so operator/support logs leak no
  local filesystem detail.
- Managed temporary, promoted, and consumer copies all live under the per-run
  tree and therefore **count toward fixed local quotas** at both the run and
  per-space level (`directoryBytes` over `runScratchDir` and `spaceRunsDir`).

### 2. Local-vs-federated artifact materialization boundary

- A slot is a **bounded, ordered file collection**. `max_files` defaults to `1`
  (singleton); `max_files > 1` is a collection, with optional `min_files` and
  `max_total_bytes`. Each file independently satisfies MIME, extension, and byte
  constraints; normalized duplicate filenames fail; submission and manifest
  preserve deterministic order. Archives remain opaque single files.
- **Singleton slots bind `.path`; collection slots bind `.directory`.** The two
  token shapes are not interchangeable: a `.path` binding on a collection (or
  `.directory` on a singleton) is rejected at apply time
  (`HANDLER_BINDING_VALUE_MISSING`) and lints as
  `ARTIFACT_TOKEN_CARDINALITY_MISMATCH`. Cardinality is captured at promotion
  time so binding projection never needs the catalog.
- **Local consumers** receive one verified directory (collection) or one
  verified file (singleton) materialized atomically under
  `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/` with digest
  verification, normalized unique names, source immutability, and all-or-nothing
  visibility. Symlinked sources or parent chains that resolve outside the run
  tree are refused as traversal.
- **Remote/federated consumers** never receive the producer's local path. They
  receive ordered immutable artifact references (`transfer_id`, `digest`,
  `size_bytes`) and materialize them in their own space. The journaled dispatch
  audit carries opaque references (`artifact:{producer}:{slot}` /
  `artifact:{producer}:{slot}:directory`, or the transfer id when available) —
  never a `.mrmr/dev/runs` host path.

## Consequences

- Murrmure owns the wire (references, manifests, retention eligibility, journal)
  while spaces own execution (what runs, what "done" means). Retention is a
  protocol-level guarantee; local byte layout is an implementation detail.
- The single canonical run root plus the guard make concurrent runs disjoint by
  construction: every scratch, transfer, artifact, and output path includes
  `run_id`, so two runs in one space never overlap.
- Global artifact references survive local byte deletion, so a federated
  consumer can still resolve a reference after the producer's run tree has been
  reclaimed — references and bytes have independent lifecycles.
- No dual-read, migration, alias, or compatibility period is provided for the
  removed `.mrmr.temp/runs` root (clean-slate cutover). Old development scratch
  may be deleted manually.
