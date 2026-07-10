# Part 3 — Connect agents

Wire three MCP sessions — one grant per space — and map wake labels to agent behavior.

## MCP config pattern

Each agent window gets its own MCP server entry (or env swap). Never reuse tokens across spaces.

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

Set a different `MURRMURE_HUB_TOKEN` per agent window/shell:

```bash
export MURRMURE_HUB_TOKEN=tok_orchestrator_...
# knowledge window -> tok_knowledge_...
# dev window -> tok_dev_...
```

Optional local switch helper:

```bash
mrmr grant use --space spc_orchestrator
```

Reload the IDE after saving. See [Connect your agent (MCP)](../../agents-mcp).

## Orchestrator agent

| Responsibility | MCP tools |
|----------------|-----------|
| Open brief | Handler dispatches on **open** — agent resolves via `murrmure_resolve_step` |
| Edit sections | Repo edits between **open** and **publish** |
| Wait for human publish | `murrmure_wait_for_run` while **publish** step is active |
| Query knowledge | `murrmure_query_ask` targeting `spc_knowledge` |

Start the flow manually in Desktop or via `mrmr flow run` on `team-brief`.

## Knowledge agent

Passive responder — no custom flow required.

- Listens for `query_ask` directed at `spc_knowledge`
- Answers from local docs / prompt context
- Does not need `flow:run` unless you add indexed handlers later

## Dev agent

| Responsibility | Mechanism |
|----------------|-----------|
| Receive publish wake | Event handler `brief.published` → `shell_spawn` with `handle_brief_published` |
| Detect pending work | `murrmure_wait_for_run`, journal subscription, or MCP wake handler in agent skill |
| Fetch brief content | `murrmure_query_ask` against `spc_orchestrator` |
| Write local artifact | Filesystem / repo edit in dev folder |

Wake labels must match exactly between handler command/prompt and agent handler registration (`handle_brief_published`).

## Verify each connection

In each agent session, call **`murrmure_space_status`** and **`murrmure_list_handlers`** — confirm the correct `spc_…` and handler catalog.

## Next

[Part 4 — Run workflow →](./04-run-workflow)
