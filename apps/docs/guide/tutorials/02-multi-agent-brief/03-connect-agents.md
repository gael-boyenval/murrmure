# Part 3 — Connect agents

Wire three MCP sessions — one per space.

## Orchestrator agent

- Grant on `spc_orchestrator` with `flow:run`, `flow:read`, cross-space query scopes
- Tools: `murrmure_invoke_action`, indexed patch actions, `murrmure_wait_for_gate` at publish checkpoint

## Knowledge agent

- Grant on `spc_knowledge`
- Answers orchestrator `query_ask` requests (no custom flow required)

## Dev agent

- Grant on `spc_dev`
- Handles `handle_brief_published` wake from hooks
- Uses `murrmure_wait_for_run` or journal to detect pending work

See [Connect your agent (MCP)](../../agents-mcp) for `.cursor/mcp.json` snippets.

## Next

[Part 4 — Run workflow →](./04-run-workflow)
