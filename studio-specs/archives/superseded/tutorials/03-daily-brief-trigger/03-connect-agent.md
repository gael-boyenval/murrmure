# Part 3 — Connect the agent wake handler

Create a connection so a local participant responds to **`handle_brief_requested`**.

## 1) Create connection

```bash
mrmr connection create --space spc_daily_brief
```

| Capability | Why |
|------------|-----|
| `flow:run` | Observe run state while flow advances |
| `step:resolve` | Resolve **agent** and **done** steps via handler contract |
| `flow:read` | Read step outputs for review context |
| `space:read` | Inspect handler catalog and journal |

## 2) Reload and verify

```bash
mrmr connection activate con_… --space spc_daily_brief
```

See [Connect your agent (MCP)](../../agents-mcp).

## 3) Agent handler responsibilities

When the event handler fires after trigger resolve:

1. **Detect wake** — MCP control channel delivers `handle_brief_requested`, or poll `murrmure_wait_for_run` on the active run
2. **Gather** — email, calendar, todos from local tools (your agent logic)
3. **Resolve agent step** — `murrmure_resolve_step` on **agent** with branch `completed` and output payload
4. **Yield** — flow advances to **review** presentation; human marks done in view

Install the murrmure agent skill for normative handler/wake patterns: [Agent skill](../../agent-skill).

## Next

[Part 4 — Run and review →](./04-run-and-review)
