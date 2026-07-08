# Tutorial 3 — Daily brief trigger

Build an indexed **`daily-brief`** flow from scratch: human clicks **Run daily brief** in a custom view → hub emits `brief.requested` → hook wakes your agent → agent submits output → human reviews in **ViewCanvasHost**.

## What you will build

| Piece | Role |
|-------|------|
| `flows/daily-brief/flow.manifest.yaml` | trigger checkpoint → agent wake → review checkpoint → done |
| `views/daily-brief/` | Same view at trigger + review steps — button vs mark-done |
| `hooks.yaml` | `brief.requested` → `mcp_wake` |
| `actions.yaml` | `mcp_wake`, `submit_brief_output` |
| Agent grant | Handles `handle_brief_requested` wake |

## End-to-end flow

```text
Human clicks "Run daily brief" in view
  → trigger checkpoint resolves
  → hub emits brief.requested
  → hook invokes mcp_wake (handle_brief_requested)
  → agent gathers data, invokes submit_brief_output
  → review checkpoint opens same view
  → human marks done → run completes
```

Compare when stuck: [`examples/flows/daily-brief-v2/`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/daily-brief-v2).

## Pages

1. [Initialize and write the flow](./01-scaffold-daily-brief)
2. [Build view, hooks, apply](./02-push-and-trigger)
3. [Connect the agent wake handler](./03-connect-agent)
4. [Run and review end-to-end](./04-run-and-review)

## Prerequisites

- Node.js 20+, Murrmure Desktop
- [Tutorial 1](../01-local-preview-review/) — space layout, views, apply, grants
- [Connect your agent (MCP)](../../agents-mcp)

## Next

[Part 1 — Initialize and write the flow →](./01-scaffold-daily-brief)
