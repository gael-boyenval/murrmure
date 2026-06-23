# BC2–BC4 — Hub ingest & live load

How pushed user bundles become **live** routes, MCP tools, and served UI.

> **Install v2:** [06-install-push-apply-http-contract.md](./06-install-push-apply-http-contract.md) · **Security:** [09-security-execution-boundaries.md](./09-security-execution-boundaries.md)

---

## Bundle identity

| Field | Owner |
|-------|-------|
| `package_id` | User manifest |
| `version` | User manifest semver |
| `bundle_digest` | **Hub-computed** SHA-256 of canonical tar.zst |
| `contract_ref_id` | **Hub-assigned** `cref_{package_id}_{contract_major}` |

Author manifest must **not** include `contract_ref_id` (ARCH-03).

---

## Ingest on `evolution.draft.upsert`

```
POST /v1/spaces/{id}/capabilities/install (v2)
  → resolve bundle (multipart | local-path allowlist | digest cache)
  → compute digest; reject BUNDLE_DIGEST_MISMATCH
  → unpack to blob store
  → Lens A (manifest, contract, mcp-tools, collisions)
  → insert CapabilityInstall draft + source_metadata
  → insert ContractRef(storage_uri, hub-assigned contract_ref_id)
```

No catalog lookup.

---

## Live apply

```
evolution.live.apply(install_id)
  → POLICY (human_only, capability:install)
  → Lens A: MCP_TOOL_COLLISION, ROUTE_PREFIX_COLLISION
  → CapabilityWorkerPool.spawn(digest) — NOT in-process import
  → Hub proxy app.route(routes_prefix, → worker)
  → Static: GET /capabilities/{pkg}/{ver}/ui/*
  → McpToolRegistry.rebuild from bundle mcp-tools.json
  → journal capability.live_applied
  → control bus contract_updated + tools_changed
```

Failure → `LIVE_APPLY_FAILED`, registry rollback, install stays `promoted`.

---

## HTTP surfaces

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/capabilities/{pkg}/{ver}/ui/*` | shell.html, entry.js, assets |
| POST | `/v1/spaces/{id}/capabilities/install` | Install v2 |
| POST | `/v1/spaces/{id}/capabilities/{install_id}/apply` | Live apply |
| GET | `/v1/spaces/{id}/capabilities/{install_id}` | Detail + source_metadata |

---

## MCP

See [07-mcp-tool-model-and-catalog-rebuild.md](./07-mcp-tool-model-and-catalog-rebuild.md).

---

## Rollback and in-flight instances (ARCH-05)

Policy: **`finish_current`** (hub default).

| Entity | On rollback to prior live version |
|--------|-----------------------------------|
| New instances | Pin new live `contract_ref_id` |
| Existing instances | Keep **pinned** `contract_ref_id` at create time |
| Agents | Rebind on reconnect for **new** work only |
| MCP catalog | Rebuild to rolled-back tool set |

Rollback triggers human gate if breaking (J11).

---

## Local dev

`bundle.mode: local-path` — allowlist `~/.studio/capabilities/` only. Hub reads bytes and computes digest.

---

## BC2–BC4 definition of done

- [ ] Push v2 creates draft from user bundle
- [ ] Worker serves capability HTTP routes
- [ ] Static UI + iframe shell.html loadable
- [ ] MCP tools from bundle with ACL filter
- [ ] Rollback restores prior worker + UI; in-flight instances unchanged
