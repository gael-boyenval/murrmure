# Plan — Normalize run scratch paths (`.mrmr.temp` vs `.mrmr/dev`)

**Date:** 2026-07-10  
**Status:** Planned — **Phase 0 path decision locked**  
**Goal:** One canonical, documented path for **per-run step workdirs, execution outputs, and promoted artifacts** — no “check whichever exists” in tutorials or operator docs, and no overlap between concurrent runs.

**Driver:** [Tutorial 1 v3 Part 4](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/04-run-and-understand.md) currently needs a path disclaimer because **normative specs** and **shipped code** disagree.

---

## Problem statement

### Two trees for the same concept

| Source | Run scratch + step artifacts | Cross-space inbox |
|--------|------------------------------|-------------------|
| **Normative** (`studio-specs/current/bridges/artifacts.md`, `step-contract.md`, `product/philosophy.md`) | `{space}/.mrmr.temp/runs/{run_id}/steps/{qualified}/…` | `{space}/.mrmr.temp/inbox/` |
| **Shipped code** (`hub-core` flow-engine) | `{space}/.mrmr/dev/runs/{run_id}/steps/{step_id}/…` | Hub exchange + `artifact-service` materialize (partial) |

### Shipped implementation anchors

| Path kind | Code |
|-----------|------|
| Step workdir (scratch) | `stepWorkdirRelPath` → `.mrmr/dev/runs/{run_id}/steps/{step_id}/work` — `packages/hub-core/src/flow-engine/step-contract-slice.ts` |
| Stable artifact after resolve | `stepStableDirRelPath` → `.mrmr/dev/runs/{run_id}/steps/{step_id}/{slot}/{name}` — `packages/hub-core/src/flow-engine/step-artifacts.ts` |
| Active step contract JSON | `.mrmr/dev/runs/{run_id}/active-step-contract.json` — `step-contract-slice.ts` |
| Space gitignore template | `.mrmr/dev/` — [space-handlers cutover](../archives/plans/shipped-2026-07/space-handlers/2026-07-09-space-handlers-contract-keys-plan.md) path map |

### Explicit prior decision (handlers cutover)

The space-handlers plan **migrated** run paths:

```text
.mrmr.temp/runs/…  →  .mrmr/dev/runs/…
.mrmr.temp/inbox/… →  .mrmr/dev/runs/{run_id}/transfers/…
```

Hub-core was updated; **`studio-specs/current/` bridges were not fully reconciled** — they still describe `.mrmr.temp/runs/…`.

### Pain points

| ID | Symptom |
|----|---------|
| **P-1** | Tutorial 1 v3 Part 4 cannot state one `ls` path without a disclaimer |
| **P-2** | Full tutorial (v1) and v3 docs mix `.mrmr/dev/runs` and `.mrmr.temp/runs` |
| **P-3** | `{{murrmure.step.*.artifact.*.path}}` tokens and handler prompts may cite wrong prefix depending on doc author |
| **P-4** | Operators grep `.mrmr.temp` per philosophy; artifacts are under `.mrmr/dev` |
| **P-5** | No single exported constant — path strings duplicated in `step-artifacts.ts`, `step-contract-slice.ts`, tests, skills |

---

## Phase 0 — Canonical layout decision

**Decision (2026-07-14):** `.mrmr/dev/runs/{run_id}/` is the only local run scratch root. Delete `.mrmr.temp/runs` readers, writers, fixtures, tests, and documentation. There is no dual-read, migration, alias, or compatibility period; old development scratch may be deleted.

**Locked concurrency invariant:** the runtime supports multiple sessions against the same applied configuration, subject to space-owned per-flow `max_concurrent_runs` in `handlers.yaml`. Every scratch, artifact, transfer, and intermediate execution-output path includes `run_id`, even for a flow configured with capacity `1`.

**Locked failed-upload invariant:** rejected, partial, and abandoned raw bytes are deleted immediately and are never governed by the normal run-retention window. Preserve only sanitized attempt metadata; do not retain content or host paths. A dev-only raw-byte quarantine mode is deferred.

**Locked upload-lease invariant:** incomplete/uncommitted uploads expire after one hour without accepted activity. Sweep at Hub startup and every 15 minutes, deleting bytes and releasing quota reservations. Successful promotion deletes temporary upload bytes immediately after atomic commit.

**Locked local retention invariant:** never garbage-collect an active run directory. Retain a terminal run's `.mrmr/dev/runs/{run_id}` tree until `terminal_at + 7 days`, then delete local bytes while preserving journal metadata and artifact manifests. Hub/global artifact retention is separate.

Hub/global immutable artifact bytes remain while referenced by any artifact manifest; no time-based global deletion ships in this release.

The seven-day period is fixed for this release. Do not add a space-level override or persisted retention-policy field; configurability is deferred until a concrete need exists.

Run GC once at Hub startup and every 24 hours thereafter. Emit one sanitized pass summary with scanned runs, deleted directories/bytes, skipped active runs, and failures. Do not expose artifact content or host paths, and do not add a manual GC command in this release.

**Locked local artifact quota invariant:** fixed ceilings are 25 MiB/file, 50 MiB/step resolution, 250 MiB/run, and 2 GiB/space across active and retained managed artifact bytes under `.mrmr/dev/runs`, including temporary upload reservations and consumer copies. Slot limits may lower these values. Reserve atomically before writing; `ARTIFACT_QUOTA_EXCEEDED` leaves the step open and releases temporary bytes/reservations. Arbitrary handler-created workdir bytes and Hub/global artifact storage are separate policies.

**Canonical:**

```text
{space}/.mrmr/dev/runs/{run_id}/
  active-step-contract.json
  steps/{step_id}/work/           # scratch upload
  steps/{step_id}/{slot}/{name}   # promoted artifact
  steps/{consumer_step}/inputs/{slot}/{name} # verified local consumer copy
  transfers/…                     # per-run cross-space inbox (if retained)
```

`.mrmr.temp/runs` is removed. Whether a separate `.mrmr.temp/inbox` concept survives for cross-space exchange is independent; it must never be treated as local run scratch.

Before local handler dispatch, authorize and digest-verify each input artifact, copy it to a temporary sibling under the consumer `inputs/{slot}` directory, then atomically rename it into place. A singleton slot (`max_files: 1`) exposes its absolute `.path`; a multi-file slot exposes the absolute slot `.directory`. Apply rejects singular path bindings for multi-file slots. Public APIs, Views, journals, and remote handlers receive ordered artifact-reference arrays and never host paths.

---

## Implementation slices (after Phase 0)

### Slice 1 — Single path module (hub-core)

| Task | Detail |
|------|--------|
| `runScratchPaths(space_root, run_id, step_id?)` | One module exporting workdir, stable slot, consumer input, and active-contract paths |
| Replace string literals | `step-artifacts.ts`, `step-contract-slice.ts`, templates, dispatch |
| Tests | `expectRunPath()` helper — one assertion surface; distinct run IDs never return overlapping mutable paths |

### Slice 2 — Normative + user docs

| Task | Path |
|------|------|
| `studio-specs/current/bridges/artifacts.md` | Run paths match decision |
| `studio-specs/current/bridges/step-contract.md` | VS-6 layout |
| `studio-specs/current/product/philosophy.md` | Arc 5 — define `.mrmr/dev/runs` as local run scratch and distinguish any retained cross-space exchange path |
| Tutorial 1 v3 Part 4 | Remove path disclaimer; one `ls` + `cat` example |
| Tutorial 1 v1 (05, 08, 04, 09) | Same path |
| `apps/docs/reference/*`, skills | Grep sweep |

### Slice 3 — Enforcement

| Task | Detail |
|------|--------|
| `docs-proof` / `check-*.mjs` | Ban opposite prefix in user docs once canonical is chosen |
| `rg` gate in CI | No `.mrmr.temp/runs` in active code, tests, fixtures, specs, tutorials, skills, or scaffolds |

### Slice 4 — Scaffold + reset note

| Task | Detail |
|------|--------|
| `mrmr space init` | Ensure gitignore + optional `dev/runs/.gitkeep` matches decision |
| Operator note | Old `.mrmr.temp/runs` development scratch is not migrated and may be deleted |

---

## Acceptance criteria

- [ ] Phase 0 ADR records `.mrmr/dev/runs` as the only run-scratch root.
- [ ] `hub-core` path construction goes through shared helper; tests use `expectRunPath()`.
- [ ] `studio-specs/current/bridges/` and Tutorial 1 v3 Part 4 cite **one** path with no “some builds” disclaimer.
- [ ] docs-proof fails if tutorials reintroduce dual-path language.
- [ ] Active code, tests, fixtures, specs, tutorials, skills, and scaffolds contain no `.mrmr.temp/runs` path.
- [ ] `{{murrmure.step.*.artifact.*.path}}` examples in skills match canonical prefix.
- [ ] Rejected/partial/abandoned upload bytes are deleted immediately while sanitized failure metadata remains observable.
- [ ] One-hour idle upload leases are reclaimed at startup and every 15 minutes; accepted activity refreshes the lease, and promotion deletes temporary bytes immediately.
- [ ] Active run directories survive every GC pass; terminal local run trees are removed only after the exact seven-day boundary.
- [ ] Local GC preserves journal metadata and artifact manifests and never deletes Hub/global artifact storage.
- [ ] Manifest-referenced Hub/global immutable artifacts have no time-based deletion path in this release.
- [ ] No local-retention configuration field or alternate duration exists in schemas, space files, or runtime code.
- [ ] GC runs at startup and every 24 hours, produces one sanitized summary per pass, and has no manual CLI/API command.
- [ ] Local consumers receive digest-verified atomic copies under their own step input directory; source artifacts remain unchanged.
- [ ] Singleton `.path` and multi-file `.directory` bindings resolve only for local handlers; invalid singular bindings fail apply and remote consumers receive ordered reference arrays.
- [ ] Public, View, journal, and remote projections expose artifact references without local host paths.
- [ ] Two concurrent runs in one space use disjoint scratch, artifact, transfer, and intermediate execution-output trees.
- [ ] No global one-active-run-per-space guard is introduced; per-flow space policy controls capacity, and apply quiescence remains a separate configuration-stability rule.
- [ ] Concurrent uploads cannot exceed fixed file/step/run/space managed-artifact ceilings; reservations count temporary bytes and consumer copies, and failures release capacity atomically.

---

## References

| Layer | Path |
|-------|------|
| Workdir | `packages/hub-core/src/flow-engine/step-contract-slice.ts` |
| Artifacts promote | `packages/hub-core/src/flow-engine/step-artifacts.ts` |
| Handlers path map | `studio-specs/archives/plans/shipped-2026-07/space-handlers/2026-07-09-space-handlers-contract-keys-plan.md` |
| Normative (stale runs path) | `studio-specs/current/bridges/artifacts.md`, `step-contract.md` |
| Tutorial disclaimer | `apps/docs/guide/tutorials/01-local-preview-review-v3/04-run-and-understand.md` |
