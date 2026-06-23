# Tutorial 3 — Daily brief trigger

Build a brand-new **`daily-brief`** flow with `@murrmure/cli`.

Your canvas UI has one action: **Run daily brief**. Clicking it emits `brief.requested`, a trigger dispatches `mcp_wake`, your agent gathers from local tools, then submits formatted markdown/json output back to Murrmure for review.

## What you build

| Piece | Role |
|-------|------|
| **`daily-brief` flow** | Contract states + canvas button + `submit_brief_output` MCP tool |
| **Trigger rule** | `brief.requested` (source) → `mcp_wake` (target agent space) |
| **Agent wake handler** | Handles `handle_brief_requested`, then calls `submit_brief_output` |
| **Human review step** | Reads output in canvas and marks the brief done |

## End-to-end Murrmure communication

1. Human clicks **Run daily brief** in the browser canvas.
2. Flow server appends `brief.requested` with payload (instance id, request id).
3. Trigger matcher routes the event to action `mcp_wake` with `wake_label: handle_brief_requested`.
4. Agent receives wake (or detects pending work via `wait_for_state` fallback).
5. Agent gathers from your local email/calendar/todo tools.
6. Agent calls `submit_brief_output` with markdown + json.
7. Flow instance moves `pending_agent` → `pending_review`.
8. Human marks done in canvas (`resolved`) or agent auto-resolves for no-review mode.

## Pending vs resolved

| Layer | Pending | Resolved |
|-------|---------|----------|
| **Trigger delivery log** | Row is queued / in-flight | Row reaches terminal outcome (`delivered`, `failed`, or dedup drop) |
| **Agent wake or wait** | Wake not consumed yet, or wait is still blocking | Wake handled, or wait returns after state advance |
| **Human review step** | Instance in `pending_review`, output visible and actionable | Instance in `resolved` (human mark done or auto-resolve path) |

## State path used in this tutorial

- Normal path: `pending_agent` → `pending_review` → `resolved`
- Optional path: `pending_agent` → `resolved` (`auto_resolve: true`)

## Pages

1. [Scaffold `daily-brief`](./01-scaffold-daily-brief)
2. [Push flow and register trigger](./02-push-and-trigger)
3. [Connect the agent wake handler](./03-connect-agent)
4. [Run and review end-to-end](./04-run-and-review)

## Prerequisites

- Node.js 20+
- Murrmure hub access (cloud or self-hosted)
- Familiarity with [Flows tutorial](../../flows-tutorial)
- Familiarity with [Connect your agent (MCP)](../../agents-mcp)

## Next

[Part 1 — Scaffold `daily-brief` →](./01-scaffold-daily-brief)
