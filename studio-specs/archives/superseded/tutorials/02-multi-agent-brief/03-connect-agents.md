# Part 3 — Connect agents

Wire three MCP sessions — one connection per trust boundary — and map wake labels to participant behavior.

## MCP config pattern

Run `mrmr connection create` for each space and install the resulting
connection into the matching context. Local descriptors use the stable launcher
with `--hub` and `--connection`; they contain no token.

```bash
mrmr connection activate con_… --space spc_orchestrator
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
