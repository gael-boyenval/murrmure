# Connect your agent (MCP)

Murrmure agents connect through the `murrmure-mcp` bridge. Humans work in Desktop; operators use `mrmr` for setup and grants.

## What MCP gives your agent

- Grant-filtered platform tools (`murrmure_space_status`, `murrmure_resolve_step`, `murrmure_wait_for_run`, …)
- Handler discovery: **`murrmure_list_handlers`**, **`murrmure_list_emittable_events`**
- Event emission: **`murrmure_emit_event`** (`event:emit` capability)
- Indexed flow + handler availability after `mrmr space apply`

`murrmure_invoke_action` remains for headless/debug invoke of legacy indexed actions — **flow step completion uses handlers + `murrmure_resolve_step`**.

## Before you start

1. Desktop is running (hub discovery is written to `~/.murrmure/hubs/shared.json`)
2. A target space exists (`spc_...`)
3. Node.js 20+ and `@murrmure/cli` installed
4. Optional but recommended: `mrmr skill install --variant agent`

## 1) Install CLI and MCP bridge

```bash
npm install -g @murrmure/cli @murrmure/mcp-bridge
```

## 2) Mint and activate a grant

```bash
mrmr grant mint --space spc_... --label "cursor-agent" \
  --capabilities space:read,flow:run,flow:read,step:resolve,journal:read
mrmr grant use --space spc_...
```

Add `event:emit` when the agent must fire platform events. Add `action:invoke` only for legacy action invoke paths.

`grant mint` prints a one-time:

```bash
export MURRMURE_HUB_TOKEN=tok_...
```

Run that export in the shell that launches your IDE/agent.

## 3) MCP config (thin shape)

Use `mrmr grant mint` prompt to write this automatically, or paste manually:

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

- Default location: `~/.cursor/mcp.json`
- Project-only option: `mrmr grant mint --local` (writes `./.cursor/mcp.json`)

Reload the IDE, then verify with `murrmure_space_status` and `murrmure_list_handlers`.

## Common issues

| Symptom | Fix |
|---------|-----|
| `TOOL_NOT_AUTHORIZED` | Mint with required capabilities; reload MCP |
| 401/403 | Mint a new grant, then `mrmr grant use --space ...` |
| Tools missing | Run `mrmr space apply --strict`, then reconnect MCP |
| Step won't advance | Agent needs `step:resolve`; handler `complete` mode must match resolve path |

See [MCP tools reference](../reference/mcp-tools) and the installed skill's `reference/mcp.md`.
