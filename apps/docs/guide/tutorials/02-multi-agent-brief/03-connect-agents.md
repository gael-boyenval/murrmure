# Part 3 — Connect all three Cursor windows

Create one `.cursor/mcp.json` per folder. Each uses a different token and space id.

## 1. Orchestrator window

File: `~/work/orchestrator/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "studio": {
      "command": "studio-hub-mcp",
      "env": {
        "STUDIO_HUB_URL": "https://api.studio.dev",
        "STUDIO_HUB_TOKEN": "tok_ORCHESTRATOR",
        "STUDIO_SPACE_ID": "spc_orchestrator"
      }
    }
  }
}
```

Expected tools after MCP reload:

- Platform: `transition`, `wait_for_state`, `emit_event`, `query_ask`
- Capability: `open_brief`, `patch_section`, `get_brief`, `wait_for_publish`

## 2. Knowledge window

File: `~/work/knowledge-base/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "studio": {
      "command": "studio-hub-mcp",
      "env": {
        "STUDIO_HUB_URL": "https://api.studio.dev",
        "STUDIO_HUB_TOKEN": "tok_KNOWLEDGE",
        "STUDIO_SPACE_ID": "spc_knowledge"
      }
    }
  }
}
```

Expected tools:

- Platform only (no custom capability required in knowledge space).

## 3. Dev window

File: `~/work/dev-project/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "studio": {
      "command": "studio-hub-mcp",
      "env": {
        "STUDIO_HUB_URL": "https://api.studio.dev",
        "STUDIO_HUB_TOKEN": "tok_DEV",
        "STUDIO_SPACE_ID": "spc_dev"
      }
    }
  }
}
```

Expected tools:

- Platform tools including `query_ask`
- Wake messages from trigger as `mcp_wake`/`wake_pending`

## 4. Reload and verify each window

In each Cursor window:

1. Reload MCP servers.
2. Ask agent to call `get_space_state`.
3. Confirm returned space id matches that folder.

Quick checks:

| Window | Verification |
|--------|--------------|
| Orchestrator | `open_brief` is visible (means `team-brief` is live and ACL is correct) |
| Knowledge | No `team-brief` tools visible (expected) |
| Dev | `query_ask` succeeds once query policy allowlist is set |

Self-hosted users: replace `https://api.studio.dev` with your hub URL in all three files.

## 5. Keep runtime tab open

Bookmark:

- `Runtime -> Orchestrator -> Instances`

You will use this page for the human Publish action in Part 4.

## Next

[Part 4 — Run the workflow →](./04-run-workflow)
