# Part 4 — Run workflow

End-to-end: orchestrator drafts brief → human publishes → dev wakes → cross-space fetch.

## Sequence

1. **Start run** — Desktop → `spc_orchestrator` → **Run** on **team-brief**, or orchestrator agent invokes `team_brief_open`
2. **Draft** — Orchestrator agent patches brief sections via MCP between **open** and **publish**
3. **Publish** — Human resolves **publish** gate in Desktop (operator panel or future publish view)
4. **Event** — Hub emits `brief.published`
5. **Hook** — `brief_published_wake` invokes `mcp_wake` → dev agent receives `handle_brief_published`
6. **Fetch** — Dev agent `query_ask` against orchestrator space for brief content
7. **Output** — Dev writes local file (e.g. `brief-output.md`) in `~/work/dev-project/`

## What to confirm in Desktop

| Signal | Where |
|--------|-------|
| Run reached **publish** | Session journal / flowchart |
| Hook delivery | Notifications or journal — `brief_published_wake` terminal state |
| Dev agent activity | Dev space journal or agent logs after wake |

## Common failure points

| Symptom | Likely cause |
|---------|----------------|
| Hook never fires | `hooks.yaml` not applied; publish gate not resolved |
| Dev agent idle | Wrong wake label; dev grant missing `action:invoke` |
| Query returns empty | Cross-space ACL not configured; wrong target space id |

## Next

[Troubleshooting →](./05-troubleshooting)
