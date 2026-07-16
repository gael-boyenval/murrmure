# Tutorial 2 — Multi-agent brief

Three folders, three hub spaces, three agents — coordinated through indexed flows, grants, and event handlers. You build the orchestrator flow from `mrmr space init`; knowledge and dev spaces need grants and handler wake labels, not full custom flows.

## Topology

| Folder | Space | Agent | Responsibility |
|--------|-------|-------|----------------|
| `~/work/orchestrator/` | `spc_orchestrator` | Orchestrator | `team-brief` flow — open brief, human publish step |
| `~/work/knowledge-base/` | `spc_knowledge` | Knowledge | Answers `query_ask` from orchestrator |
| `~/work/dev-project/` | `spc_dev` | Dev | Receives handler wake on `brief.published`, cross-space fetch |

```text
Orchestrator space                    Knowledge space
  team-brief flow                       query handler
  handlers.yaml ──brief.published──►  (answers questions)
       │                                      ▲
       │ shell_spawn wake                     │ query_ask
       ▼                                      │
  Dev space ◄─────────────────────────────────┘
  handle_brief_published wake
```

## What you will build (orchestrator folder)

| Piece | Role |
|-------|------|
| `.mrmr/flows/team-brief/flow.manifest.yaml` | open → publish (human) → done |
| `.mrmr/space/handlers.yaml` | Step handlers + `brief.published` event wake |
| Grants | Cross-space query + step resolve on each space |

## Pages

1. [Build orchestrator flow](./01-build-orchestrator-flow) — init space, write manifest and handlers
2. [Admin setup](./02-admin-setup) — three spaces, link, apply, cross-space grants
3. [Connect agents](./03-connect-agents) — MCP per space, wake labels
4. [Run workflow](./04-run-workflow) — end-to-end publish → wake → fetch
5. [Troubleshooting](./05-troubleshooting)

## Prerequisites

- Completed [Tutorial 1](../01-local-preview-review/) (`.mrmr/` layout, handlers, apply, grants)
- Murrmure Desktop or hub at `http://127.0.0.1:8787`
- Three local folders and three agent sessions (or sequential testing)

## Next

[Part 1 — Build orchestrator flow →](./01-build-orchestrator-flow)
