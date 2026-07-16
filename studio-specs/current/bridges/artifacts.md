# Artifacts bridge (rev-1 §7)

Murrmure artifacts move large payloads out of journal `data` and invoke bodies. The hub stores canonical bytes; spaces receive materialized copies under `.mrmr.temp/`.

## Two-tier model

| Tier | Limit | Storage |
|------|-------|---------|
| Inline | ≤ 64 KiB (65536 bytes) | Journal `data`, invoke `params` |
| Artifact | TTL-bound (default 7 days) | `~/.murrmure/exchanges/{transfer_id}/` + `{space}/.mrmr.temp/` |

Oversize inline payloads are rejected with `INLINE_PAYLOAD_EXCEEDED` and a hint to call `PUT /v1/artifacts`.

## HTTP

### `PUT /v1/artifacts`

Registers an artifact manifest and stores bytes in the hub exchange store. The
body is raw bytes (`application/octet-stream`); the JSON/base64 body path was
removed in the Task 15 v2 cutover.

```
PUT /v1/artifacts
Content-Type: application/octet-stream
x-murrmure-space-id: spc_backend
x-murrmure-name: openapi.diff
x-murrmure-authorized-readers: spc_frontend,actor:alice
x-murrmure-hold: false
x-murrmure-ttl-days: 7

<raw bytes>
```

Response: `{ "artifact": { "kind": "mrmr.artifact/v1", "transfer_id": "xfr_…", … } }`

Scopes: `blob:write`

Idempotency: same `source_space_id` + content digest returns the existing manifest.

### `GET /v1/artifacts/{transfer_id}?space_id=spc_…`

Returns manifest metadata when the requester space or actor is listed in `authorized_readers`.

Scopes: `blob:read`

### `POST /v1/artifacts/{transfer_id}/materialize`

```json
{ "space_id": "spc_frontend" }
```

Copies exchange bytes to `{space_root}/.mrmr.temp/inbox/{transfer_id}/{name}` after digest verification.

### `GET /v1/artifacts/{transfer_id}/bytes?space_id=spc_…`

Serves the raw exchange bytes to a federated consumer. The requester `space_id`
must be listed in `authorized_readers` (the authoritative gate — the token's own
space boundary is intentionally not re-checked, so a cross-hub fetch may present a
producer-space credential while requesting bytes authorized to the consumer space).
Enforces expiry and digest verification identically to the local materialize path
and returns `application/octet-stream` with `x-murrmure-digest` / `x-murrmure-name`
headers. A destination hub uses this to retrieve relayed references by
`transfer_id` without destination pre-seeding.

Scopes: `blob:read` or a federated `step:resolve` credential.

## Dispatch integration

Internal dispatch (handler `shell_spawn`/`mcp_session`, scheduler, and the
peer-only federation relay invoke endpoint)
accepts inbound artifact references:

```json
{ "artifacts_in": ["xfr_01J…"], "params": { … } }
```

Before dispatch the hub materializes each artifact into the target space inbox and injects:

```json
"params": {
  "artifacts": [
    {
      "transfer_id": "xfr_01J…",
      "name": "openapi.diff",
      "digest": "sha256:…",
      "local_path": ".mrmr.temp/inbox/xfr_01J…/openapi.diff"
    }
  ]
}
```

## Surfaces

| Path | Role |
|------|------|
| `{space}/.mrmr.temp/inbox/` | Received artifacts (gitignored) |
| `{space}/.mrmr.temp/outbox/` | Pending send staging |
| `~/.murrmure/exchanges/{transfer_id}/` | Canonical hub copy + recovery |

`mrmr space init` scaffolds `.mrmr.temp/` with a gitignore hint.

## Step-scoped layout (v3 step contracts)

`.mrmr/dev/runs/{run_id}/` is the **only** local run-scratch root** (constructed
by `runScratchDir` / `spaceRunsDir`; see ADR-014). Every scratch, transfer,
artifact, and consumer-copy path includes `run_id`, so concurrent runs in one
space use disjoint trees.

```text
.mrmr/dev/runs/{run_id}/steps/{qualified}/work/            # active-step scratch
.mrmr/dev/runs/{run_id}/steps/{qualified}/{slot}/          # stable after resolve (singleton file or collection dir)
.mrmr/dev/runs/{run_id}/steps/{consumer}/inputs/{slot}/    # verified local consumer copy/collection
```

| Operation | API |
|-----------|-----|
| Reserve + authorize | `POST /v1/runs/{run_id}/steps/{step_id}/upload-intents` |
| Transfer one declared file | `PUT /v1/upload-intents/{intent_id}/files/{index}` |
| Cancel before commit | `DELETE /v1/upload-intents/{intent_id}` |
| Promote + consume | `upload_intent_id` on `POST …/resolve` |

The removed JSON/base64 `POST …/work/upload` API returns
`DIRECT_WORK_UPLOAD_REMOVED`; Views have no direct replacement. A trusted local
agent bridge may submit a relative active-workdir path through `artifacts_out`.

## Collections and run retention (v3 Task 11)

A slot is a **bounded, ordered file collection**. `max_files` defaults to `1`
(singleton); `max_files > 1` declares a collection, with optional `min_files`
and `max_total_bytes`. Each file independently satisfies MIME, extension, and
byte constraints; normalized duplicate filenames fail; submission and manifest
preserve deterministic order. Archives remain opaque single files.

**Token shapes are not interchangeable:**

- Singleton slots bind `{{murrmure.step.{producer}.artifact.{slot}.path}}`.
- Collection slots bind `{{murrmure.step.{producer}.artifact.{slot}.directory}}`.

A `.path` binding on a collection (or `.directory` on a singleton) is rejected
at apply time (`HANDLER_BINDING_VALUE_MISSING`) and lints as
`ARTIFACT_TOKEN_CARDINALITY_MISMATCH`.

**Local-vs-federated materialization boundary:**

- A **local** consumer receives one verified directory (collection) or file
  (singleton) materialized atomically under
  `.mrmr/dev/runs/{run_id}/steps/{consumer}/inputs/{slot}/` with digest
  verification, normalized unique names, source immutability, and all-or-nothing
  visibility.
- A **remote/federated** consumer receives ordered immutable artifact references
  (`transfer_id`, `digest`, `size_bytes`) and materializes them in its own
  space — never the producer's local path. The destination fetches each
  referenced artifact from the producer's `GET /v1/artifacts/{transfer_id}/bytes`
  endpoint using the relayed `hub_url` / `hub_token` (no destination pre-seeding)
  and re-verifies the digest against the reference before writing consumer copies,
  then rebinds the verified copies into the handler tokens. Relayed references are
  validated against `authorized_readers` and expiry before materialization — the
  same ACL/expiry checks the normal `artifacts_in` path enforces — so a caller
  cannot bypass artifact authorization by supplying a `step_contract`. The
  producer bytes endpoint binds the artifact ACL principal to the credential, not
  a caller-supplied `?space_id=` (parity with `artifacts_in`, whose principal is the
  authenticated invoke context): the resolve token the producer mints for a
  `remote_hub` dispatch carries a persisted `consumer_space_id` binding, and the
  claimed `space_id` must match it; a same-space `blob:read` token may read only its
  own space's artifacts; a bootstrap or wrong-space credential is rejected with
  `ARTIFACT_ACCESS_DENIED` before any bytes are served. Relayed reference
  `name`, `slot`, `producer_step`, and the destination `consumer_step` (the
  relayed public invoke `step_id`) are all validated as single safe path
  segments before they are joined into a consumer-copy path — no `..`, absolute
  paths, or path separators — so a crafted, digest-valid reference or a crafted
  relayed `step_id` cannot escape the linked space root during materialization;
  a resolved-path containment check at the write sink backstops that validation.
  A malformed relay is rejected with `ARTIFACT_PATH_TRAVERSAL` before any consumer
  bytes are written. The journaled dispatch audit carries opaque references
  (`artifact:{producer}:{slot}(:directory)`, or the transfer id) and never a
  `.mrmr/dev/runs` host path.

**Run retention:** active run directories are never collected. Terminal local
bytes (`completed`/`failed`/`cancelled` with `ended_at`) expire at
`ended_at + 7 days`. GC runs at Hub startup and every 24 hours, removes only the
per-run tree, and preserves journal metadata and global artifact manifests/refs.
Managed temporary, promoted, and consumer copies all count toward fixed local
quotas. No manual GC command or release-time override ships. See ADR-014.

## Upload intent lifecycle

An intent is issued only after the Hub verifies the active run and step,
selected branch, actor/capability, ordered file metadata, branch slot contract,
idempotency key, and quota reservation. The binding cannot be changed after
issuance. Bytes with missing intents, metadata mismatches, stale leases, wrong
actors, or replay mismatches are rejected.

Fixed local ceilings:

| Scope | Ceiling |
|-------|---------|
| File | 25 MiB |
| One step resolution | 50 MiB |
| Run | 250 MiB |
| Space | 2 GiB |

Uncommitted intents expire after exactly one idle hour. Only accepted file
activity refreshes the lease. The Hub sweeps at startup and every 15 minutes,
deletes temporary bytes, and releases reservations. Resolve promotes bytes,
deletes transfer staging, and consumes the intent once. Pre-commit cancellation
leaves the step open; a post-commit retry reconciles through resolve
idempotency.

Upload-attempt diagnostics contain only run, step, branch, slot, filename,
declared MIME type, received byte count, hash when available, failure
code/stage, actor, and timestamp. Rejected content, credentials, and host paths
are never retained.

## GC

Daemon daily tick runs `ArtifactGcCommand` (hub-core pure logic):

- Default TTL 7 days (hub-configurable via `ttl_days` on put)
- `hold: true` skips deletion
- Journal event: `mrmr.artifact.expired`

## Journal events

| type | When |
|------|------|
| `mrmr.artifact.transferred` | Artifact registered |
| `mrmr.artifact.expired` | GC removed expired artifact |

## Related

- [cross-space/spec.md](../cross-space/spec.md) — typed reads vs artifact passthrough
- [handlers.md](./handlers.md) — primary execution path for flow steps
