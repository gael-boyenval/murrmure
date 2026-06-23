# Tutorials

Hands-on walkthroughs that build **custom flows from scratch** with `@murrmure/cli`. Each tutorial explains how work moves between **pending** and **resolved** — contract states, agent waits, triggers, and human canvas actions.

Each tutorial is written as **incremental edits**: what file to change, which lines matter, and why the step exists.  
You get focused snippets and checkpoints instead of full-file copy/paste dumps.

## Choose a tutorial

| | Tutorial | You learn |
|---|----------|-----------|
| **1** | [Local preview review](./01-local-preview-review/) | One agent + one human · localhost preview · approve or request changes until `resolved` |
| **2** | [Multi-agent brief](./02-multi-agent-brief/) | Three agents · custom `team-brief` · publish + trigger wake + `query_ask` |
| **3** | [Daily brief trigger](./03-daily-brief-trigger/) | Canvas button · `brief.requested` event · trigger wakes agent · formatted output back to Murrmure |

Recommended order: **1 → 2 → 3**. Tutorial 1 is the gentlest on-ramp (local hub, one agent). Tutorial 2 adds cross-space orchestration. Tutorial 3 adds triggers and event-driven wakes.

## Before you start

- Node.js 20+ and a running hub ([self-hosted](../self-hosted) or cloud)
- [Install dependencies](../installation) — `@murrmure/cli` for building, `@murrmure/cli` for agents
- [How it fits together](../how-it-fits-together) — two-minute architecture read

For the full FDK reference (every CLI flag and evolution step), see the [Flows tutorial](../flows-tutorial).

## Pending vs resolved (shared vocabulary)

Every tutorial uses the same coordination vocabulary:

| Layer | Pending | Resolved |
|-------|---------|----------|
| **Contract state** | Active state waiting for the next actor | Terminal state or transition to the next active state |
| **Agent wait** | MCP wait returns `status: "pending"` | Wait returns `status: "resolved"` with a payload |
| **Trigger delivery** | Log row queued or in-flight | `delivered`, `failed`, or dedup drop |
| **Human canvas** | Buttons enabled, review in progress | Action taken → instance transitions |

See each tutorial's overview page for the exact states and tool names used in that workflow.
