# Tutorial 2 — Multi-agent brief (custom flow)

Three folders. Three spaces. Three agents.

The orchestrator agent drafts a brief with a **new custom flow** (`team-brief`), knowledge and dev agents contribute answers through prompts, you publish in the browser, and a trigger sends **`mcp_wake`** to the dev space.

This tutorial intentionally avoids bundled `feature-spec` and `review-loop`.

## Topology

| Folder | Space | Agent | Responsibility |
|--------|-------|-------|----------------|
| `~/work/orchestrator/` | `spc_orchestrator` | Orchestrator | Runs `team-brief`: `open_brief`, `patch_section`, `wait_for_publish`, `transition` |
| `~/work/knowledge-base/` | `spc_knowledge` | Knowledge | Answers questions from docs (one-line local work) |
| `~/work/dev-project/` | `spc_dev` | Dev | Gets wake trigger, runs `query_ask`, writes local file |

## What stays minimal

- Only one custom flow: `team-brief` in orchestrator space.
- No second custom flow in knowledge/dev spaces.
- Knowledge and dev contributions are prompt-based; orchestrator merges with MCP section patches.
- Human publish stays explicit in Runtime UI (no auto-publish).

## Pending vs resolved

| Layer | Pending | Resolved |
|------|---------|----------|
| **Brief state** | `gathering`, `draft`, or `pending_publish` | `published` |
| **Publish wait** (`wait_for_publish`) | `{ "status": "pending" }` while waiting for your Publish click | `{ "status": "resolved", ... }` after publish |
| **Trigger delivery** | Delivery row is queued/in-progress (`pending`) | Delivery row ends as `resolved` (or `delivered`, depending on UI wording) |
| **Trigger failure** | Delivery row `failed` means wake not completed | Fixed after retry/republish produces a resolved delivery |
| **Cross-space fetch** (`query_ask`) | Request in flight | JSON summary returned from orchestrator space |

## Pages in this tutorial

1. [Build orchestrator flow](./01-build-orchestrator-flow)
2. [Admin setup](./02-admin-setup)
3. [Connect agents](./03-connect-agents)
4. [Run workflow](./04-run-workflow)
5. [Troubleshooting](./05-troubleshooting)

## Prerequisites

- [Flows tutorial](/guide/flows-tutorial) completed once
- Cloud workspace or self-hosted hub already reachable
- Three local folders and three Cursor windows

## Next

[Part 1 — Build `team-brief` →](./01-build-orchestrator-flow)
