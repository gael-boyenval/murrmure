# Install, push, and apply — HTTP contract (v2)

**Status:** normative (2026-06-20)  
**Supersedes:** catalog-shaped install body in [../config/spec.md](../config/spec.md) §POST capabilities/install (v1 deprecated)

---

## Install v2 — `POST /v1/spaces/{space_id}/capabilities/install`

Command: `evolution.draft.upsert`  
Scope: `capability:install`

### Request

```json
{
  "package_id": "review-loop-lite",
  "version": "1.0.0",
  "bundle": {
    "mode": "digest",
    "digest": "sha256:abc…"
  },
  "source_metadata": {
    "source_path": "/Users/dev/workflows/review-loop-lite",
    "built_at": "2026-06-20T12:00:00Z",
    "sdk_version": "0.1.0"
  },
  "config": {},
  "target_state": "draft"
}
```

### Bundle upload modes

| `bundle.mode` | Body | Hub behavior |
|---------------|------|--------------|
| `digest` | digest only | Blob must exist (prior multipart) or error |
| `multipart` | `Content-Type: multipart/form-data` field `bundle` | Hub stores + computes digest |
| `local-path` | `"local_path": "~/.studio/capabilities/{id}/{ver}/bundle.tar.zst"` | Same-machine only; path allowlist roots; hub computes digest |

**Security:** Hub never trusts client digest without verifying bytes (ARCH-04). `local-path` allowed roots:

- `~/.studio/capabilities/`
- Hub `dataDir/staging/` (CI drop zone)

### Response

```json
{
  "install_id": "ins_…",
  "package_id": "review-loop-lite",
  "version": "1.0.0",
  "evolution_state": "draft",
  "contract_ref_id": "cref_review_loop_lite_1",
  "bundle_digest": "sha256:abc…"
}
```

`contract_ref_id` assigned by hub: `cref_{package_id}_{contract_major}` from parsed contract (ARCH-03).

### Errors

| Code | When |
|------|------|
| `BUNDLE_DIGEST_MISMATCH` | Claimed digest ≠ computed |
| `BUNDLE_NOT_FOUND` | digest mode without blob |
| `LOCAL_PATH_DENIED` | Path outside allowlist |
| `MANIFEST_INVALID` | Lens A fail at ingest |
| `INSTALL_POLICY_VIOLATION` | Agent on human_only space |
| `SCOPE_ENFORCEMENT_FAILURE` | Missing `capability:install` |

---

## Evolution endpoints (unchanged paths)

| CLI command | HTTP | Hub command |
|-------------|------|-------------|
| `studio capability push` | `POST …/capabilities/install` | `evolution.draft.upsert` |
| `studio capability validate --install` | `POST …/evolution/validate` | `evolution.validate` |
| `studio capability test --install` | `POST …/evolution/test` | `evolution.test.run` |
| `studio capability promote --install` | `POST …/evolution/promote` | `evolution.promote.request` |
| `studio capability apply --install` | `POST …/capabilities/{install_id}/apply` | `evolution.live.apply` |
| `studio capability rollback --install` | `POST …/evolution/rollback` | `evolution.rollback` |

All require `Authorization: Bearer` with path `space_id` match.

---

## Apply — `POST /v1/spaces/{space_id}/capabilities/{install_id}/apply`

See [04-hub-ingest.md](./04-hub-ingest.md), [09-security-execution-boundaries.md](./09-security-execution-boundaries.md).

On success: `evolution_state: live`, journal `capability.live_applied`, control bus `tools_changed`.

On failure: `LIVE_APPLY_FAILED`, hint `{ rollback: true, install_id }`.

---

## CI push (cloud profile)

`POST /v1/ci/capabilities/push` — see [08-auth-profiles-local-cloud-ci.md](./08-auth-profiles-local-cloud-ci.md).

**No general CLI shortcut:** `studio capability push` always targets `draft`. CI route may chain validate→test→promote→apply with deploy token attestation (OD-S4).

---

## CLI output

All commands support `--json`:

```json
{
  "ok": true,
  "command": "push",
  "install_id": "ins_…",
  "evolution_state": "draft",
  "contract_ref_id": "cref_…",
  "bundle_digest": "sha256:…",
  "next_steps": ["validate", "test", "promote", "apply"]
}
```

Errors:

```json
{
  "ok": false,
  "code": "MANIFEST_INVALID",
  "message": "…",
  "hint": { "file": "contract/contract.json", "line": 12 },
  "errors": [{ "code": "GRAPH_UNREACHABLE", "state": "orphan" }]
}
```

---

## CapabilityInstall metadata (Configure)

Extended row fields for UX-05:

| Field | Source |
|-------|--------|
| `source_path` | `source_metadata.source_path` |
| `bundle_digest` | hub-computed |
| `built_at` | `source_metadata.built_at` |
| `sdk_version` | `source_metadata.sdk_version` |

---

## v1 deprecation

Catalog install body (`package_id` + `version` + `config` + `target_state: live` without bundle) **deprecated**. Configure install wizard uses CDK push flow — see [archives/superseded/bundled-catalog-migration.md](../../archives/superseded/bundled-catalog-migration.md).
