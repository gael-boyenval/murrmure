# Platform model

Murrmure is an **agentic operating system** — protocol kernel + space directory + custom views as the human shell.

## Hub entities (stored)

| Entity | Role |
|--------|------|
| **Journal** | Append-only event log; dedup via `source`+`id` |
| **Session** | Correlation grouping; user-facing label |
| **Run** | Immutable execution unit; step memo; exec context |
| **Gate** | Pending human checkpoint on a run (`input-required`) |
| **Artifact** | Transfer refs with digest + TTL |
| **Grant** | Capability token on `(actor, space[, flow[, action]])` |

## Space directory (indexed on apply)

| Concept | File(s) |
|---------|---------|
| **Space** | `murrmure/space.yaml` + link binding |
| **Action** | `murrmure/actions.yaml` — named callable |
| **Executor** | `murrmure/executors.yaml` — how actions run |
| **Flow** | `murrmure/flows/*/flow.manifest.yaml` |
| **Hook** | `murrmure/hooks.yaml` — event/schedule reactions |
| **View** | `murrmure/views/*/` — client bundle (not a hub entity) |

## Agent vs human paths

| Actor | Primary interface |
|-------|-------------------|
| **Agent** | MCP tools (`murrmure_invoke_action`, wait/resolve) |
| **Human (workflow)** | Custom view in **ViewCanvasHost** at checkpoint steps |
| **Human (operator)** | Shell chrome — space home, flowchart, gate inbox (admin/debug) |

Custom views are the product. Shell chrome is operator mode — not what authors ship to end users.

## Execution flow

1. Trigger matches (`triggers:` manual / event / schedule / `flow_call`)
2. Hub creates Session + Run with pinned `flow_digest`
3. Engine dispatches steps: `invoke`, `checkpoint`, `parallel.matrix`, `start_flow`
4. Checkpoint pauses run → gate pending → human resolves via view or fallback panel
5. `on_resolve` routes to next step via `goto` / `fail`

## Index path

**Always** `mrmr space apply` for v2 flows in `murrmure/flows/`. The hub compiles IR and stores digests — editing files alone does nothing at runtime until apply succeeds.

See [space-directory.md](space-directory.md), [flow-authoring.md](flow-authoring.md), [mcp.md](mcp.md).
