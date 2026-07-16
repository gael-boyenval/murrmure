# Part 4 — Run workflow

End-to-end: orchestrator drafts brief → human publishes → dev wakes → cross-space fetch.

## Sequence

1. **Start run** — Desktop → `spc_orchestrator` → **Run** on **team-brief**
2. **Draft** — Orchestrator agent edits brief sections between **open** and **publish**
3. **Publish** — Human resolves **publish** in Desktop (operator panel or future publish view)
4. **Event** — Hub emits `brief.published`
5. **Handler** — `brief-published-wake` runs `shell_spawn` → dev agent receives `handle_brief_published`
6. **Fetch** — Dev agent `query_ask` against orchestrator space for brief content
7. **Output** — Dev writes local file (e.g. `brief-output.md`) in `~/work/dev-project/`

## What to confirm in Desktop

| Signal | Where |
|--------|-------|
| Run reached **publish** | Session journal / flowchart |
| Handler delivery | Journal — `handler:brief-published-wake` terminal state |
| Dev agent activity | Dev space journal or agent logs after wake |

## Common failure points

| Symptom | Likely cause |
|---------|----------------|
| Handler never fires | `handlers.yaml` not applied; publish step not resolved |
| Dev agent idle | Wrong wake label; dev grant missing `step:resolve` or federation |
| Query returns empty | Cross-space ACL not configured; wrong target space id |

## Next

[Troubleshooting →](./05-troubleshooting)
