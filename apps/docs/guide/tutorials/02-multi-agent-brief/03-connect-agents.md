# Part 3 — Connect agents

Wire three MCP sessions — one grant per space — and map wake labels to agent behavior.

## MCP config pattern

Each agent window gets its own MCP server entry (or env swap). Never reuse tokens across spaces.

```json
{
  "mcpServers": {
    "murrmure-orchestrator": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "http://127.0.0.1:8787",
        "MURRMURE_HUB_TOKEN": "tok_orchestrator_…",
        "MURRMURE_SPACE_ID": "spc_orchestrator"
      }
    },
    "murrmure-knowledge": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "http://127.0.0.1:8787",
        "MURRMURE_HUB_TOKEN": "tok_knowledge_…",
        "MURRMURE_SPACE_ID": "spc_knowledge"
      }
    },
    "murrmure-dev": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "http://127.0.0.1:8787",
        "MURRMURE_HUB_TOKEN": "tok_dev_…",
        "MURRMURE_SPACE_ID": "spc_dev"
      }
    }
  }
}
```

Reload the IDE after saving. See [Connect your agent (MCP)](../../agents-mcp).

## Orchestrator agent

| Responsibility | MCP tools |
|----------------|-----------|
| Open brief | `murrmure_invoke_action` → `team_brief_open` |
| Edit sections | Patch actions (skill-defined or custom indexed actions) |
| Wait for human publish | `murrmure_wait_for_run` while **publish** step is active |
| Query knowledge | `murrmure_query_ask` targeting `spc_knowledge` |

Start the flow manually in Desktop or via `mrmr flow run` on `team-brief`.

## Knowledge agent

Passive responder — no custom flow required.

- Listens for `query_ask` directed at `spc_knowledge`
- Answers from local docs / prompt context
- Does not need `flow:run` unless you add indexed actions later

## Dev agent

| Responsibility | Mechanism |
|----------------|-----------|
| Receive publish wake | Hook `brief.published` → `mcp_wake` with `handle_brief_published` |
| Detect pending work | `murrmure_wait_for_run`, journal subscription, or MCP wake handler in agent skill |
| Fetch brief content | `murrmure_query_ask` against `spc_orchestrator` |
| Write local artifact | Filesystem / repo edit in dev folder |

Wake labels must match exactly between hook params and agent handler registration (`handle_brief_published`).

## Verify each connection

In each agent session, call **`murrmure_space_status`** and confirm the correct `spc_…` and tool catalog.

## Next

[Part 4 — Run workflow →](./04-run-workflow)
