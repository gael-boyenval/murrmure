# Tutorial 2 — Multi-agent brief (indexed v2)

Three folders. Three spaces. Three agents.

The orchestrator runs an indexed **`team-brief`** flow, knowledge and dev agents contribute via grants and cross-space invoke, you publish in **Murrmure Desktop**, and **`murrmure/hooks.yaml`** wakes the dev agent on `brief.published`.

**Example tree (orchestrator space):** [`examples/flows/team-brief-v2/`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/team-brief-v2)

## Topology

| Folder | Space | Agent | Responsibility |
|--------|-------|-------|----------------|
| `~/work/orchestrator/` | `spc_orchestrator` | Orchestrator | Indexed `team-brief` flow + section patches via MCP |
| `~/work/knowledge-base/` | `spc_knowledge` | Knowledge | Answers questions (prompt + local docs) |
| `~/work/dev-project/` | `spc_dev` | Dev | Receives hook wake, runs cross-space query, writes local file |

## v2 mechanism

| Old pattern | v2 replacement |
|-------------|----------------|
| Worker MCP mount tools | Indexed actions + `murrmure_invoke_action` |
| Push + promote install | `mrmr space apply --strict` |
| Trigger register CLI | `murrmure/hooks.yaml` + apply |

## Pages

1. [Build orchestrator flow](./01-build-orchestrator-flow)
2. [Admin setup](./02-admin-setup)
3. [Connect agents](./03-connect-agents)
4. [Run workflow](./04-run-workflow)
5. [Troubleshooting](./05-troubleshooting)

## Prerequisites

- [Tutorial 1](../01-local-preview-review/) or [Flows tutorial](../../flows-tutorial)
- Murrmure Desktop or hub at `http://127.0.0.1:8787`
- Three local folders and three agent windows

## Next

[Part 1 — Build `team-brief` →](./01-build-orchestrator-flow)
