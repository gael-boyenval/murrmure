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

Registers an artifact manifest and stores bytes in the hub exchange store.

```json
{
  "space_id": "spc_backend",
  "name": "openapi.diff",
  "content_base64": "…",
  "authorized_readers": ["spc_frontend", "actor:alice"],
  "hold": false,
  "ttl_days": 7
}
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

## Invoke integration

`POST /v1/spaces/{space_id}/actions/{action_name}/invoke` accepts:

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

```text
.mrmr/dev/runs/{run_id}/steps/{qualified}/work/     # active-step scratch
.mrmr/dev/runs/{run_id}/steps/{qualified}/{slot}/   # stable after resolve
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
- [action-invoke.md](./action-invoke.md) — invoke HTTP surface
