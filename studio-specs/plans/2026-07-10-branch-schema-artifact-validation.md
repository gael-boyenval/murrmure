# Plan — Branch schema artifact validation (SDK + resolve)

**Date:** 2026-07-10  
**Status:** Planned — **not started**  
**Goal:** Branch `schema` and all resolver clients must treat **artifact uploads** as part of the resolve contract—not a separate, optional side channel. Authors can declare **file-only** steps (no payload fields) and the hub rejects incomplete resolves.

**Tutorial driver:** [Tutorial 1 v3 Part 2](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/02-build-minimal-flow.md) — `intake` `continue` branch:

```yaml
schema:
  type: object
  required: [spec]
artifact_slots:
  spec:
    description: The spec markdown file
    max_bytes: 1048576
```

Names in `schema.required` that match `artifact_slots` keys are **artifact requirements**, not JSON payload fields.

Authors do not add a fake `schema.properties.<slot>` entry or artifact-specific JSON Schema format. The compiler partitions required names by matching same-branch artifact slot keys.

**Related:** [2026-07-10-flow-branch-api-simplify.md](./2026-07-10-flow-branch-api-simplify.md) (routing ergonomics and resolver-agnostic steps). [2026-07-10-view-sdk-contracts-and-upload.md](./2026-07-10-view-sdk-contracts-and-upload.md) (space-owned `view_resolver`, SDK contract exposure, and client validation).

**Schema engine decision:** payload schemas use JSON Schema Draft 2020-12 through one shared Ajv 8 wrapper in trusted runtimes. Hub validation remains authoritative. Remote `$ref` loading and user-supplied executable/custom formats are disabled.

`format` assertions use a fixed `ajv-formats` allowlist: `date`, `time`, `date-time`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`, `uri`, and `uri-reference`. Unknown/custom formats fail apply.

All transports project failures as `{ code: "CONTRACT_VALIDATION_FAILED", errors: [{ source: "payload" | "artifact", path, rule, message }] }`, with RFC 6901 JSON Pointer paths. Raw Ajv internals, schema paths, content, and host paths are never returned.

---

## Problem statement

### Today (v2.2 shipped)

| Layer | Behavior | Gap |
|-------|----------|-----|
| **Resolve** (`step-resolve.ts`) | `validatePayloadSchema` checks `schema.required` against **`payload` only** | `required: [spec]` looks for `payload.spec` — not `artifacts_out` |
| **Artifacts** (`step-artifacts.ts`) | `validateArtifactsOut` runs only when `artifacts_out` is non-empty; validates slot names and `max_bytes` on promote | Declared slots are **never required** — resolve without file succeeds |
| **Catalog compile** | `artifact_slots` merged per step from all branches | Per-branch artifact requirements not exposed on branch catalog entries |
| **ViewAppContext** | `step.branch_names` only | Views do not receive branch `schema` or `artifact_slots` — cannot validate before submit |
| **View SDK** | `submit(params, artifacts?)` uploads then resolves | No contract-driven check that required slots were passed |
| **Shell host bridge** | `shell-web` `mapViewSubmitToResolveStep` omits `artifacts_out` | Host-mediated resolve path cannot carry files (view-sdk direct path can) |

Authors who want **file-only intake** must duplicate intent: `artifact_slots` for upload mechanics **and** a payload field like `spec_filename` if they want `schema.required` enforcement — or accept silent success without a file.

### Target behavior

1. **Authoring:** `schema.required` may list artifact slot names declared on the same branch under `artifact_slots`. No duplicate payload field required.
2. **Resolve:** `POST …/resolve` and `murrmure_resolve_step` return **`400 INVALID_ARTIFACTS`** (or `INVALID_PAYLOAD` with clear message) when a required slot is missing from `artifacts_out`.
3. **Compile / apply:** Lint when `schema.required` names an unknown slot, or `artifact_slots` keys are never referenced and branch has no payload properties (optional warning).
4. **View SDK:** `ViewAppContext` exposes per-branch **resolve contract** (payload schema + artifact slots). Helpers (or `useViewSubmit`) can validate artifacts before upload/resolve.
5. **Shell:** ViewCanvasHost passes compiled branch contract into context; host resolve adapter forwards `artifacts_out` when present.
6. **Failed upload observability:** rejected, partial, and abandoned bytes are deleted immediately; sanitized attempt metadata remains available without content or host paths.
7. **Consumption:** before local handler dispatch, an authorized promoted artifact is digest-verified and atomically copied into the consumer step's run-scoped `inputs/{slot}` directory. Remote consumers receive an artifact reference, not a producer host path.

---

## Normative contract (proposed)

### Branch resolve contract

For each branch on a step catalog entry:

| Field | Validates |
|-------|-----------|
| `schema` (JSON Schema `type: object`) | **`payload`** — properties not matching artifact slot names |
| `schema.required[]` | Union of **payload required keys** and **artifact slot names** (when slot exists in branch `artifact_slots`) |
| `artifact_slots` | Slot metadata (`description`, `max_bytes`, optional future `mime_types`) |

**Resolution rules:**

1. Partition `schema.required` into `payloadRequired` and `artifactRequired` using branch `artifact_slots` keys.
2. Validate `payload` against `payloadRequired` + `schema.properties` (existing shallow check; extend later if needed).
3. Validate `artifacts_out` includes every `artifactRequired` slot with a resolvable workdir path.
4. Promote artifacts; reject unknown slots, traversal, `max_bytes` (existing).
5. On failure or abandonment, delete raw bytes immediately and persist only sanitized diagnostics: run, step, branch, slot, filename, declared MIME type, received byte count, hash when available, failure code/stage, actor, and timestamp.
6. Validate the partitioned payload schema as Draft 2020-12 through the shared Ajv wrapper. Trusted host validation provides UX parity; Hub validation runs independently and authoritatively.

**Example — file-only intake (`continue`):**

```yaml
schema:
  type: object
  required: [spec]
artifact_slots:
  spec: { max_bytes: 1048576 }
```

- Valid resolve: `{ branch: "continue", payload: {}, artifacts_out: [{ slot: "spec", path: "hero.md" }] }`
- Invalid: `{ branch: "continue", payload: {} }` → missing required artifact `spec`

**Example — mixed payload + file (preview-review intake):**

```yaml
schema:
  type: object
  required: [reviewer, spec]
artifact_slots:
  spec: { max_bytes: 1048576 }
```

- `reviewer` → payload; `spec` → artifact.

### ViewAppContext extension (proposed)

```typescript
interface ViewStepContext {
  step_id: string;
  branch_names?: string[];
  branches?: Record<string, {
    schema?: Record<string, unknown>;
    artifact_slots?: Record<string, {
      description?: string;
      media_types?: string[];
      extensions?: string[];
      min_files?: number;
      max_files?: number;
      min_bytes?: number;
      max_bytes?: number;
      max_total_bytes?: number;
    }>;
  }>;
}
```

Views use `context.step.branches.continue` to drive UI (file picker required, submit disabled until satisfied). Optional SDK export: `validateResolveContract(branch, { payload, artifacts })`.

---

## Implementation slices

### Slice 1 — Contracts + catalog (hub-core compile)

| Task | Path / note |
|------|-------------|
| Per-branch `artifact_slots` on compiled catalog (not only step-level merge) | `step-contract-compile.ts`, `StepContractCatalogEntrySchema` / branch schema in `packages/contracts` |
| Slot constraints: `media_types`, normalized `extensions`, `min_bytes`, `max_bytes`; validate min/max and allow empty by default | contracts + compile/apply lint |
| Slot collection constraints: `min_files`, `max_files` (default `1`), `max_total_bytes`; required slot effective minimum ≥ 1 | contracts + compile/apply lint |
| Lint: `schema.required` artifact names must exist in branch `artifact_slots` | `lintBranchRoutes` or new `lintBranchSchema` |
| Lint: unknown `artifact_slots` keys never in `required` (warning) | apply `--strict` optional |
| Draft validation | Shared Ajv 8 Draft 2020-12 wrapper; reject remote refs and executable/custom formats during apply |

**Done gate:** unit tests for compile + lint; catalog JSON includes branch-level slots.

### Slice 2 — Resolve enforcement (hub-core)

| Task | Path / note |
|------|-------------|
| `partitionRequiredFields(schema, artifact_slots)` | new helper in `step-resolve.ts` or `step-artifacts.ts` |
| `validateRequiredArtifacts(artifacts_out, artifactRequired, artifact_slots)` | fail when slot missing |
| Validate declared MIME metadata, normalized case-insensitive extension, and decoded byte range before promotion; no content sniffing | resolve/upload path |
| Validate repeated same-slot references as one bounded collection; reject duplicate normalized filenames and enforce count/aggregate bytes | resolve/upload path |
| Atomically reserve fixed local file/step/run/space capacity before writing; return `ARTIFACT_QUOTA_EXCEEDED` and release on failure | artifact service + run/space accounting |
| One-hour idle upload leases, startup + 15-minute sweeper, immediate post-promotion temp deletion | upload lease service + Hub lifecycle |
| Explicit pre-byte upload intent bound to active branch, ordered metadata, actor, quota reservation, and idempotency; atomic consume on resolve | Hub upload/resolve routes + trusted host/bridge |
| Update `validatePayloadSchema` to use payload-only partition | clear error: `Missing required field 'reviewer' in resolve payload` vs `Missing required artifact 'spec'` |
| Failed-upload cleanup and diagnostics | delete rejected/partial/abandoned bytes immediately; retain sanitized metadata without content or host paths |
| Consumer materialization handoff | authorize + digest-verify immutable artifact; use the canonical run-path helper to atomically create a local consumer copy before dispatch |
| Tests | extend `step-resolve-artifacts.test.ts`, HTTP resolve tests in `hub-daemon` |

**Done gate:** resolve without required artifact returns 400; mixed branch covered.

### Slice 3 — Handoff to View resolver + SDK plan

This plan owns the compiled branch contract and hub enforcement only. The View plan consumes that contract and owns `open_steps[]` projection, `view_resolver` lookup, shell context, SDK, and removal of built-in forms.

| Task | Path / note |
|------|-------------|
| Export one browser-safe compiled branch contract type | `packages/contracts` |
| Consumer gate: `open_steps[]` carries the branch contract selected through `view_resolver` | `2026-07-10-view-sdk-contracts-and-upload.md` |
| Consumer gate: View sends `File`/`Blob` intent to the trusted host; host uses this plan's bounded upload/resolve path and the View receives no Hub mutation token | same |
| Consumer gate: no `role`, `presentation`, `active_human_step`, or built-in resolver form | same |

**Done gate:** the View plan imports this plan's canonical contract; submit without file fails client-side and server-side.

### Slice 4 — MCP + CLI

| Task | Path / note |
|------|-------------|
| `murrmure_resolve_step` error text documents artifact vs payload misses | `mcp-handlers.ts` |
| `mrmr step resolve` — same validation path | `packages/cli/src/commands/run/step-resolve.ts` |
| Skill updates | `skill-agent`, `skill-developer/reference/flow-authoring.md` |

### Slice 5 — Docs + normative bridge

| Task | Path |
|------|------|
| `studio-specs/current/bridges/step-contract.md` — artifact names in `schema.required` | normative |
| `apps/docs/reference/view-sdk.md` — branch contract in context, artifact validation | reference |
| `apps/docs/guide/tutorials/01-local-preview-review-v3/02-build-minimal-flow.md` — remove “product gap” caveat once shipped | tutorial |
| `apps/docs/guide/known-gaps.md` — entry until closed | operator |

**Doc sync rule:** bridge + reference + tutorial in same PR as Slice 2–3 behavior.

---

## Phase 0 — Decisions

1. **Artifact declaration — decided:** `required: [spec]` plus same-branch `artifact_slots.spec` is sufficient; no fake payload property or artifact-specific JSON Schema format.
2. **Optional artifact slots — decided:** a slot absent from same-branch `schema.required` is optional; if supplied, it receives the complete slot, size, digest, authorization, promotion, and lifecycle validation.
3. **Branch scope — decided:** every branch owns its complete resolve schema and artifact slots. Remove the step-level merged schema/slot union; runtime and consumers use only the selected branch contract.
4. **Host vs direct resolve — decided:** the trusted host forwards View payload/files through the canonical upload/resolve path; direct View-to-Hub mutation and View-held Hub tokens are removed.
5. **Agent resolves — decided:** agents obey the same selected-branch contract as Views. A local MCP bridge may read/upload a workspace path and submit the resulting artifact reference; remote agents and direct Hub requests cannot pass machine-local paths.
6. **JSON Schema engine — decided:** use Draft 2020-12 through a shared Ajv 8 wrapper in trusted host/Hub runtimes; no remote ref fetching, user executable/custom formats, or Ajv compilation in the untrusted View iframe.
7. **Format vocabulary — decided:** enable only `date`, `time`, `date-time`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`, `uri`, and `uri-reference` through `ajv-formats`; unknown/custom formats fail apply.
8. **Error projection — decided:** View, HTTP, MCP, and CLI use the same normalized `CONTRACT_VALIDATION_FAILED` envelope with `source`, RFC 6901 `path`, stable `rule`, and human `message`; no raw Ajv or host internals.
9. **Nested return validation — decided:** resolving a child validates only the selected child branch. Resume carries the already-validated child result to the still-open parent; the parent validates its own selected branch payload/artifacts only when it resolves itself.
10. **Authoring layout — decided:** branch `schema`, `artifact_slots`, and optional `route` / `resume` remain sibling fields. Do not add `payload`, `outcome`, or other wrappers.
11. **File constraints — decided:** slots may declare `media_types`, normalized `extensions`, `min_bytes`, and `max_bytes`; every declared constraint must match. MIME is metadata only, extensions compare case-insensitively after basename normalization, and empty files are valid by default (`min_bytes: 0`). No content sniffing in this release.
12. **Collection cardinality — decided:** one slot contains a bounded file collection. `max_files` defaults to `1`; optional `min_files` and `max_total_bytes` apply; required slots have effective minimum one. Every file is independently validated, normalized duplicate filenames fail, and archives remain opaque single files.
13. **Local quotas — decided:** fixed ceilings are 25 MiB/file, 50 MiB/step resolution, 250 MiB/run, and 2 GiB/space across active and retained local run artifacts. Slot constraints may lower them. Atomic overflow returns `ARTIFACT_QUOTA_EXCEEDED`, leaves the step open, and releases all temporary bytes/reservations. Hub/global storage is separate.
14. **Retention — decided:** incomplete/uncommitted uploads expire after one idle hour and are swept at Hub startup plus every 15 minutes. Failed/rejected/cancelled and post-promotion temporary bytes are deleted immediately. Local promoted copies use seven-day terminal-run retention; Hub/global immutable bytes remain while any artifact manifest references them.
15. **Upload intent — decided:** the Hub issues an explicit intent before bytes after validating active run/step/branch, authorization, slot contract, ordered file metadata, cardinality, and quota. Intent is actor/idempotency-bound, trusted-host-only, and consumed atomically with resolve; expiry/cancel releases bytes and reservations.

**Deliverable:** ADR or bridge section recording these decisions; no code until reviewed.

---

## Acceptance criteria

- [ ] Tutorial 1 v3 `intake` manifest validates at apply; resolve without `spec` file fails with explicit error.
- [ ] File-only artifact requirements compile without `schema.properties.<slot>` and no consumer synthesizes a fake payload field.
- [ ] Resolve with only `artifacts_out` (empty payload) succeeds on file-only branch.
- [ ] Mixed `reviewer` + `spec` branch still works (payload + artifact partition).
- [ ] Each compiled branch carries its own schema and slots; no step-level merged resolve contract remains.
- [ ] View SDK context includes branch `schema` + `artifact_slots`; sample intake view uses it.
- [ ] Unit + HTTP tests; docs-proof / strict apply lints pass.
- [ ] No regression: optional `artifact_slots` without `required` remain optional.
- [ ] Rejected/partial/abandoned upload bytes are removed immediately; diagnostics retain useful metadata but never content or host paths.
- [ ] Local consumers receive a verified run-scoped copy without mutating the source artifact; remote/public projections contain artifact references and no host paths.
- [ ] Local MCP workspace-path submission uploads through the bridge; remote/direct-Hub path submission is rejected; both enforce the same branch requirements.
- [ ] Trusted host and Hub pass the same Draft 2020-12 conformance vectors; Hub remains authoritative; remote refs/custom executable formats fail apply.
- [ ] Every allowed format has positive/negative parity vectors; an unknown/custom format fails apply.
- [ ] View, HTTP, MCP, and CLI return identical normalized error fixtures without Ajv internals, content, schema paths, or host paths.
- [ ] Nested resume cannot satisfy, bypass, or validate the parent's branch contract; parent resolution independently enforces its selected branch.
- [ ] MIME/extension constraints reject missing or mismatched metadata, min/max byte boundaries are exact, invalid ranges fail apply, and empty files pass unless `min_bytes` forbids them.
- [ ] Singleton and multi-file slots enforce required cardinality, repeated same-slot references, per-file/aggregate limits, unique normalized filenames, and opaque-archive handling.
- [ ] Concurrent file/step/run/space quota reservations cannot oversubscribe; overflow keeps the step open and leaves no bytes or reservations behind.
- [ ] Upload leases refresh only on accepted activity, expire at the exact idle boundary, and are reclaimed on startup/15-minute cadence; promotion leaves no duplicate temporary bytes and referenced global artifacts survive local GC.
- [ ] No bytes are accepted without a valid explicit intent; metadata/state/replay mismatches fail safely, resolve consumes intents exactly once, and Views never receive intent IDs or Hub credentials.

---

## References

| Layer | Path |
|-------|------|
| Resolve validation (today) | `packages/hub-core/src/flow-engine/step-resolve.ts` — `validatePayloadSchema` |
| Artifact promote | `packages/hub-core/src/flow-engine/step-artifacts.ts` |
| View submit + upload | `packages/view-sdk/src/app/resolve-step.ts`, `provider.tsx` |
| Shell context | `packages/shell-web/src/lib/view-app-context.ts` |
| Authoring schema | `packages/contracts/src/entities/step-contract.ts` |
| Normative bridge | `studio-specs/current/bridges/step-contract.md` |
| Tutorial target | `apps/docs/guide/tutorials/01-local-preview-review-v3/02-build-minimal-flow.md` |
