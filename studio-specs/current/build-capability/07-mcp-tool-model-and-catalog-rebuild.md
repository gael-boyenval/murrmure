# MCP tool model and catalog rebuild

**Status:** normative  
**Aligns with:** `@murrmure/mcp-bridge` + hub `/v1/mcp/catalog`

---

## Bridge shape

MCP clients use thin config:

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure-mcp",
      "env": {
        "MURRMURE_HUB_TOKEN": "${env:MURRMURE_HUB_TOKEN}"
      }
    }
  }
}
```

- No legacy CLI-arg MCP launch shape
- No MCP `MURRMURE_SPACE_ID`
- No MCP `MURRMURE_HUB_URL` (bridge discovery file drives endpoint)

---

## Tool visibility

```text
visible(token) =
  platform_tools(token.scopes, token.flow_acl)
```

Representative platform catalog:

- `murrmure_space_status`, `murrmure_apply_space`, `murrmure_grant_mint`
- `murrmure_create_session`, `murrmure_create_run`, `murrmure_get_run`
- `murrmure_list_step_contracts`, `murrmure_resolve_step`, `murrmure_wait_for_run`
- `murrmure_journal_query`, `murrmure_attach_orchestration`, `murrmure_get_run_graph`

Legacy tools (`murrmure_complete_action`, `murrmure_wait_for_gate`, `murrmure_resolve_gate`) are removed.

---

## Rebuild triggers

`McpToolRegistry.rebuild(space_id)` on:

- index/apply updates
- grant scope/ACL mutations
- flow availability changes

Bridge forwards catalog changes through MCP client notifications.

---

## Invoke path

```text
tools/call(name, args)
  -> tool in catalog for token
  -> strict schema validation (inputSchema)
  -> hub route invoke
  -> denial => TOOL_NOT_AUTHORIZED / schema error
```

Catalog and invoke parity must hold across:

- MCP `tools/list` / `tools/call`
- hub HTTP `/v1/mcp/catalog` / `/v1/mcp/tools/call`

---

## Related

- [04-hub-ingest.md](./04-hub-ingest.md)
- [05-manifest-and-bundle-schema.md](./05-manifest-and-bundle-schema.md)
