# Part 4 — Run workflow

End-to-end: orchestrator drafts brief → human publishes → dev wakes → cross-space fetch.

1. Orchestrator agent opens brief (`team_brief_open` invoke)
2. Human edits sections via orchestrator MCP patch actions
3. Human resolves **publish** checkpoint in Desktop (shell resolve panel or future publish view)
4. Hook fires `brief.published` → `mcp_wake` on dev space
5. Dev agent runs `query_ask` against orchestrator space
6. Dev writes local output file

Confirm hook delivery in Desktop notifications / journal.

## Next

[Troubleshooting →](./05-troubleshooting)
