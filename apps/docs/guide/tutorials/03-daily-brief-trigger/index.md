# Tutorial 3 — Daily brief trigger

Build an indexed **`daily-brief`** flow: human clicks **Run daily brief** in a **ViewCanvasHost** custom view → `brief.requested` hook wakes your agent → formatted output → human review checkpoint.

**Example tree:** [`examples/flows/daily-brief-v2/`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/daily-brief-v2)

## What you build

| Piece | Role |
|-------|------|
| **`daily-brief` flow** | Checkpoint views + agent wake + review checkpoint |
| **`murrmure/hooks.yaml`** | `brief.requested` → `mcp_wake` |
| **Custom view** | `murrmure/views/daily-brief/` — button emits event via view submit |
| **Agent handler** | Responds to wake, calls `submit_brief_output` indexed action |

## End-to-end flow

1. Human opens run → **trigger** checkpoint in **ViewCanvasHost**
2. View submit resolves checkpoint; hub emits `brief.requested`
3. Hook invokes `mcp_wake` with `handle_brief_requested`
4. Agent gathers from local tools, invokes `submit_brief_output`
5. **Review** checkpoint in **ViewCanvasHost** — human marks done

## Pages

1. [Scaffold `daily-brief`](./01-scaffold-daily-brief)
2. [Apply and register hooks](./02-push-and-trigger)
3. [Connect the agent wake handler](./03-connect-agent)
4. [Run and review end-to-end](./04-run-and-review)

## Prerequisites

- Node.js 20+, Murrmure Desktop
- [Tutorial 1](../01-local-preview-review/) or [Flows tutorial](../../flows-tutorial)
- [Connect your agent (MCP)](../../agents-mcp)

## Next

[Part 1 — Scaffold `daily-brief` →](./01-scaffold-daily-brief)
