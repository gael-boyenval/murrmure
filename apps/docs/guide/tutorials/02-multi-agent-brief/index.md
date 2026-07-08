# Tutorial 2 — Multi-agent brief

Three folders, three hub spaces, three agents — coordinated through indexed flows, grants, and hooks. You build the orchestrator flow from `mrmr space init`; knowledge and dev spaces need grants and hook handlers, not full custom flows.

## Topology

| Folder | Space | Agent | Responsibility |
|--------|-------|-------|----------------|
| `~/work/orchestrator/` | `spc_orchestrator` | Orchestrator | `team-brief` flow — open brief, human publish checkpoint |
| `~/work/knowledge-base/` | `spc_knowledge` | Knowledge | Answers `query_ask` from orchestrator |
| `~/work/dev-project/` | `spc_dev` | Dev | Receives hook wake on `brief.published`, cross-space fetch |

```text
Orchestrator space                    Knowledge space
  team-brief flow                       query handler
  hooks.yaml ──brief.published──►     (answers questions)
       │                                      ▲
       │ mcp_wake                             │ query_ask
       ▼                                      │
  Dev space ◄─────────────────────────────────┘
  handle_brief_published wake
```

## What you will build (orchestrator folder)

| Piece | Role |
|-------|------|
| `flows/team-brief/flow.manifest.yaml` | open → publish checkpoint → done wake |
| `actions.yaml` | `team_brief_open`, `mcp_wake` |
| `hooks.yaml` | `brief.published` event → wake dev agent |
| Grants | Cross-space query + flow run on each space |

Compare when stuck: [`examples/flows/team-brief-v2/`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/team-brief-v2) — diff only, do not clone as the tutorial path.

## Pages

1. [Build orchestrator flow](./01-build-orchestrator-flow) — init space, write manifest, actions, hooks
2. [Admin setup](./02-admin-setup) — three spaces, link, apply, cross-space grants
3. [Connect agents](./03-connect-agents) — MCP per space, wake labels
4. [Run workflow](./04-run-workflow) — end-to-end publish → wake → fetch
5. [Troubleshooting](./05-troubleshooting)

## Prerequisites

- Completed [Tutorial 1](../01-local-preview-review/) (space layout, apply, grants)
- Murrmure Desktop or hub at `http://127.0.0.1:8787`
- Three local folders and three agent sessions (or sequential testing)

## Next

[Part 1 — Build orchestrator flow →](./01-build-orchestrator-flow)
