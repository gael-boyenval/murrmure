# Install, push, and apply — HTTP contract (v3)

**Status:** normative (2026-06-23)  
**Supersedes:** v2 catalog-shaped install body in [../config/spec.md](../config/spec.md) §POST flows/install

---

## Install v3 — `POST /v1/spaces/{space_id}/flows/install`

Command: `evolution.draft.upsert`  
Scope: `flow:install`

### Request

```json
{
  "flow_id": "review-loop-lite",
  "version": "1.0.0",
  "bundle": {
    "mode": "multipart",
    "digest": "sha256:abc…"
  },
  "source": {
    "mode": "multipart",
    "digest": "sha256:def…"
  },
  "source_metadata": {
    "source_path": "/Users/dev/workflows/review-loop-lite",
    "built_at": "2026-06-20T12:00:00Z",
    "cli_version": "0.1.0",
    "dev_kit_version": "0.1.0"
  },
  "config": {},
  "target_state": "draft"
}
```

### Upload modes

| Field | `mode` | Body | Hub behavior |
|-------|--------|------|--------------|
| `bundle` | `digest` | digest only | Blob must exist (prior multipart) or error |
| `bundle` | `multipart` | `Content-Type: multipart/form-data` field `bundle` | Hub stores + computes digest |
| `bundle` | `local-path` | `"local_path": "~/.murrmure/flows/{flow_id}/{ver}/bundle.tar.zst"` | Same-machine only; path allowlist roots |
| `source` | `digest` | digest only | Source blob must exist or error |
| `source` | `multipart` | multipart field `source` | Hub stores at `sources/{flow_id}/{version}/source.tar.zst` |
| `source` | `local-path` | allowlisted under `~/.murrmure/flows/` | Same-machine dev only |

**Security:** Hub never trusts client digest without verifying bytes (ARCH-04). `local-path` allowed roots:

- `~/.murrmure/flows/`
- Hub `dataDir/staging/` (CI drop zone)

Hub ingest:

1. Verify both digests against uploaded bytes.
2. Store runtime blob → live mount path unchanged in behavior.
3. Store source blob for audit, diff, re-build.
4. Lens A validates **runtime** tree; source tree validated for **required paths** only (no execute).

### Response

```json
{
  "install_id": "ins_…",
  "flow_id": "review-loop-lite",
  "version": "1.0.0",
  "evolution_state": "draft",
  "contract_ref_id": "cref_review_loop_lite_1",
  "bundle_digest": "sha256:abc…",
  "source_digest": "sha256:def…"
}
```

`contract_ref_id` assigned by hub: `cref_{flow_id}_{contract_major}` from parsed contract (ARCH-03).

### Errors

| Code | When |
|------|------|
| `BUNDLE_DIGEST_MISMATCH` | Claimed bundle digest ≠ computed |
| `SOURCE_DIGEST_MISMATCH` | Claimed source digest ≠ computed |
| `BUNDLE_NOT_FOUND` | digest mode without runtime blob |
| `SOURCE_BUNDLE_MISSING` | source archive absent |
| `LOCAL_PATH_DENIED` | Path outside allowlist |
| `MANIFEST_INVALID` | Lens A fail at ingest |
| `INSTALL_POLICY_VIOLATION` | Agent on human_only space |
| `SCOPE_ENFORCEMENT_FAILURE` | Missing `flow:install` |

---

## Evolution endpoints

| CLI command | HTTP | Hub command |
|-------------|------|-------------|
| `mrmr flow push` | `POST …/flows/install` | `evolution.draft.upsert` |
| `mrmr flow validate --install` | `POST …/evolution/validate` | `evolution.validate` |
| `mrmr flow test --install` | `POST …/evolution/test` | `evolution.test.run` |
| `mrmr flow promote --install` | `POST …/evolution/promote` | `evolution.promote.request` |
| `mrmr flow apply --install` | `POST …/flows/{install_id}/apply` | `evolution.live.apply` |
| `mrmr flow rollback --install` | `POST …/evolution/rollback` | `evolution.rollback` |

All require `Authorization: Bearer` with path `space_id` match.

---

## Apply — `POST /v1/spaces/{space_id}/flows/{install_id}/apply`

See [04-hub-ingest.md](./04-hub-ingest.md), [09-security-execution-boundaries.md](./09-security-execution-boundaries.md).

On success: `evolution_state: live`, journal `flow.live_applied`, control bus `tools_changed`.

On failure: `LIVE_APPLY_FAILED`, hint `{ rollback: true, install_id }`.

---

## CI push (cloud profile)

`POST /v1/ci/flows/push` — see [08-auth-profiles-local-cloud-ci.md](./08-auth-profiles-local-cloud-ci.md).

**No general CLI shortcut:** `mrmr flow push` always targets `draft`. CI route may chain validate→test→promote→apply with deploy token attestation (OD-S4).

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
  "source_digest": "sha256:…",
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

## FlowInstall metadata (Configure)

Extended row fields for UX-05:

| Field | Source |
|-------|--------|
| `source_path` | `source_metadata.source_path` |
| `bundle_digest` | hub-computed |
| `source_digest` | hub-computed |
| `built_at` | `source_metadata.built_at` |
| `cli_version` | `source_metadata.cli_version` |
| `dev_kit_version` | `source_metadata.dev_kit_version` |

Configure UI shows runtime digest + “View built UI”; source digest + “Download source snapshot” (admin/grant gated).

---

## v1 deprecation

Catalog install body (`flow_id` + `version` + `config` + `target_state: live` without bundle) **deprecated**. Legacy `/capabilities/` routes return 410. Configure install wizard uses FDK push flow — see [archives/superseded/bundled-catalog-migration.md](../../archives/superseded/bundled-catalog-migration.md).
