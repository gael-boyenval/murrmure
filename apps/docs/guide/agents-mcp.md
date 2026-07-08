# Connect your agent (MCP)

Murrmure agents connect through **MCP**. Humans use **Murrmure Desktop**; admins use the **`mrmr` CLI** for setup and grants.

**Agent authoring and protocol behavior:** follow the installed **[murrmure skill](./agent-skill)** (`mrmr skill install`) — not this page. This page covers MCP connection only.

## What MCP gives your agent

- Platform tools: `murrmure_space_status`, `murrmure_invoke_action`, `murrmure_resolve_step`, `murrmure_wait_for_run`, …
- Grant-filtered catalog scoped to `MURRMURE_SPACE_ID`
- v2 indexed flows after `mrmr space apply`

## Before you start

1. Murrmure Desktop running (or hub at `http://127.0.0.1:8787`)
2. Target space exists (`spc_...`)
3. Grant token from **`mrmr grant mint`**
4. Node.js 20+ and `@murrmure/cli` installed ([Installation](./installation))
5. **`mrmr skill install`** for flow/view/checkpoint guidance

## 1) Install MCP package

```bash
npm install -g @murrmure/cli
```

## 2) Mint grant

```bash
mrmr grant mint --space spc_… --label "cursor-agent" --capabilities space:read,flow:run,action:invoke,gate:resolve
```

Save the one-time token (`tok_...`) and space id (`spc_...`).

## 3) MCP config

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "http://127.0.0.1:8787",
        "MURRMURE_HUB_TOKEN": "tok_...",
        "MURRMURE_SPACE_ID": "spc_..."
      }
    }
  }
}
```

Reload the IDE after saving. Verify with `murrmure_space_status`.

## Common issues

| Symptom | Fix |
|---------|-----|
| `TOOL_NOT_AUTHORIZED` | Fix grant capabilities; reload MCP |
| 401/403 | Mint new token |
| Missing tools | Correct `MURRMURE_SPACE_ID`; run `mrmr space apply` |

See the installed skill's `reference/mcp.md` and [MCP tools reference](../reference/mcp-tools).

## Next

- [Agent skill](./agent-skill) — install the normative agent skill
- [Quick start](./quick-start)
- [Murrmure Desktop](./desktop)
