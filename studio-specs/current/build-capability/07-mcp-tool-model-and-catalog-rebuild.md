# MCP tool model and catalog rebuild

**Status:** normative (2026-06-20)  
**Aligns with:** [../flow-runtime/spec.md](../flow-runtime/spec.md) grant-filtered catalog

---

## Declaration source

MCP tools for a capability come **only** from the pushed bundle:

```
{blob}/contract/mcp-tools.json     → names + input schemas + HTTP map
{blob}/manifest.json               → mcp_tools_by_version[semver]
```

No platform `@studio/review-contracts` at runtime for user capabilities.

---

## Tool visibility

```
visible(token, space) =
  platform_tools(token.scopes)
  ∪ flow_tools(live_installs(space), token.flow_acl, live_semver)
  filtered_by harness_binding(token.harness, tool.harness_allow?)
```

| Grant scope | Platform tools |
|---------------|----------------|
| `space:read` | `get_space_state`, `contract_versions` |
| `state:transition` | + `transition`, `wait_for_state` |
| `event:emit` | + `emit_event` |
| `capability:install` | + config tools (future) |

Domain tools: live install + name in `mcp_tools_by_version[live semver]` + package in ACL.

---

## Rebuild triggers

`McpToolRegistry.rebuild(space_id)` on:

- `evolution.live.apply`
- `evolution.rollback`
- `grant.revoke` / `grant.rotate` / ACL patch

Push `tools_changed` to connected principals (CR2).

---

## Collision rules (ARCH-06)

Before live apply, Lens A validates:

- Unique `(space_id, tool_name)` across **all live** capability manifests
- On conflict: `MCP_TOOL_COLLISION` with hint `{ tool, existing_package_id }`

Offline CDK validate warns if staged package reuses names from `~/.studio/staged-tool-index` (optional local cache).

---

## Invoke path

```
MCP tools/call(name, args)
  → tool ∈ catalog for token?
  → strict Zod deserialize from mcp-tools.json schema
  → HTTP to capability route (in-process or via worker — see 09)
  → journal on denial: TOOL_NOT_AUTHORIZED
```

Cross-surface parity: `tools/list`, `tools/call`, `/v1/mcp/catalog`, capability HTTP routes.

---

## Version bump behavior

| Event | Catalog |
|-------|---------|
| Minor promote + apply | Add tools; existing sessions keep pinned contract |
| Major promote + apply | New tools; agents receive `contract.updated` + `tools_changed` |
| Rollback | Removed tools not invokable; `tools_removed` in control bus |

---

## mcp_wake (unchanged)

Wake labels route by `wake_label` — **no** catalog registration required (CR-ADR-06).

---

## Related

- [05-manifest-and-bundle-schema.md](./05-manifest-and-bundle-schema.md)
- [04-hub-ingest.md](./04-hub-ingest.md)
