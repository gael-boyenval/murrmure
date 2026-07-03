# Part 3 — Connect the agent wake handler

Mint a grant on `spc_daily_brief`:

```bash
mrmr grant mint --space spc_daily_brief \
  --capabilities flow:run,flow:read \
  --label daily-brief-agent
```

Agent responsibilities:

1. Detect `handle_brief_requested` wake (MCP control channel or `murrmure_wait_for_run`)
2. Gather email/calendar/todo from local tools
3. Invoke indexed action `submit_brief_output` with markdown + json body

See [Agents MCP](../../agents-mcp) and the **`murrmure`** skill (`reference/hooks-triggers.md`).

## Next

[Part 4 — Run and review →](./04-run-and-review)
