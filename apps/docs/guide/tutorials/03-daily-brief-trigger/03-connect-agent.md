# Part 3 — Connect the agent wake handler

Mint a grant and configure MCP so an agent responds to **`handle_brief_requested`**.

## 1) Mint grant

```bash
mrmr grant mint --space spc_daily_brief \
  --capabilities flow:run,flow:read,action:invoke \
  --label daily-brief-agent
```

| Capability | Why |
|------------|-----|
| `flow:run` | Observe run state while flow advances |
| `action:invoke` | Call `submit_brief_output` with gathered content |
| `flow:read` | Read step outputs for review context |

## 2) MCP config

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "http://127.0.0.1:8787",
        "MURRMURE_HUB_TOKEN": "tok_…",
        "MURRMURE_SPACE_ID": "spc_daily_brief"
      }
    }
  }
}
```

See [Connect your agent (MCP)](../../agents-mcp).

## 3) Agent handler responsibilities

When the hook fires after trigger resolve:

1. **Detect wake** — MCP control channel delivers `handle_brief_requested`, or poll `murrmure_wait_for_run` on the active run
2. **Gather** — email, calendar, todos from local tools (your agent logic)
3. **Submit** — `murrmure_invoke_action` → `submit_brief_output` with `{ format: "markdown", body: "…" }`
4. **Yield** — flow advances to **review** checkpoint; human marks done in view

Install the murrmure skill for normative hook/wake patterns: [Agent skill](../../agent-skill).

## Next

[Part 4 — Run and review →](./04-run-and-review)
