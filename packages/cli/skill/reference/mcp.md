# Murrmure MCP

Agents connect via **`@murrmure/cli`** (stdio bridge to hub HTTP).

## Cursor config

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "http://127.0.0.1:8787",
        "MURRMURE_HUB_TOKEN": "tok_…",
        "MURRMURE_SPACE_ID": "spc_ui_sandbox"
      }
    }
  }
}
```

Monorepo dev: point `command` at `packages/cli/dist/mcp.js` or use `npx @murrmure/cli mcp`.

## How the catalog works

On startup, the MCP bridge calls:

```http
GET /v1/mcp/catalog?space_id={MURRMURE_SPACE_ID}
Authorization: Bearer {token}
```

Tools = platform tools (by grant scopes) **union** flow tools (live installs ∩ `capability_acl`).

Tool calls proxy to:

```http
POST /v1/mcp/tools/call?space_id=…
{ "name": "open_session", "arguments": { … } }
```

**Reload MCP** after promote/apply or grant changes.

## Mint grants

**Configure → [space] → Agent grants → Mint grant**

- **Template:** Worker (agents) or Admin (install/promote)
- **Flow ACL:** check every package the agent should call, e.g. `["app-live-review"]`

Without ACL entry, domain tools are hidden even when live.

## Platform tools (always scope-gated)

| Tool | Scope |
|------|-------|
| `get_space_state` | `space:read` |
| `contract_versions` | `space:read` |
| `transition` | `state:transition` |
| `wait_for_state` | `state:transition` |
| `emit_event` | `event:emit` |
| `query_ask` | `space:read` |

## Flow tools

Declared in **your** `contract/mcp-tools.json` and listed in manifest `mcp_tools_by_version`. Names are global per space — avoid collisions across packages.

Session-creating tools should return `instance_id` and `murrmure_url` / `canvas_path` (hub may enrich automatically).

## Verify connection

Ask the agent to call `contract_versions` or `get_space_state`. List tools in Cursor MCP panel after reload.

## Humans vs agents

| Action | Human | Agent |
|--------|-------|-------|
| Install/promote/apply | Configure + CLI | CLI (`flow:install` scope) |
| Review canvas | Runtime → Instances | MCP creates instance + shares URL |
| Mint grants | Configure | — |
