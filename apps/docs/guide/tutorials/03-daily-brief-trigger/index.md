# Tutorial 3 — Daily brief trigger

Build an indexed **`daily-brief`** flow from scratch: human clicks **Run daily brief** in a custom view → hub emits `brief.requested` → event handler wakes your agent → agent submits output → human reviews in **ViewCanvasHost**.

## What you will build

| Piece | Role |
|-------|------|
| `.mrmr/flows/daily-brief/flow.manifest.yaml` | trigger view → agent → review view → done |
| `.mrmr/views/daily-brief/` | Same view at trigger + review steps — button vs mark-done |
| `.mrmr/space/handlers.yaml` | Agent step handlers + `brief.requested` event wake |
| Agent grant | Handles `handle_brief_requested` wake |

## End-to-end flow

```text
Human clicks "Run daily brief" in view
  → trigger step resolves (murrmure_resolve_step)
  → hub emits brief.requested
  → handler shell_spawn (handle_brief_requested)
  → agent gathers data, resolves agent step
  → review presentation opens same view
  → human marks done → run completes
```

Compare when stuck: [`examples/flows/daily-brief-v2/`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/daily-brief-v2/.mrmr).

## Pages

1. [Initialize and write the flow](./01-scaffold-daily-brief)
2. [Build view, handlers, apply](./02-push-and-trigger)
3. [Connect the agent wake handler](./03-connect-agent)
4. [Run and review end-to-end](./04-run-and-review)

## Prerequisites

- Node.js 20+, Murrmure Desktop
- [Tutorial 1](../01-local-preview-review/) — `.mrmr/` layout, handlers, views, apply, grants
- [Connect your agent (MCP)](../../agents-mcp)

## Next

[Part 1 — Initialize and write the flow →](./01-scaffold-daily-brief)
