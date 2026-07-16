# MCP tools (agent reference)

Connection-filtered tools from `/v1/mcp/catalog`. Reload MCP after connection
installation or `mrmr space apply`.

## Cross-space query

| Tool | Capability | Notes |
|------|------------|-------|
| `query_ask` | `space:read` | Typed cross-space query (`spec_summary@1`). Target space needs inbound allowlist. |

## Session & run

| Tool | Capability | Notes |
|------|------------|-------|
| `murrmure_create_session` | `flow:run` | Returns `ses_*` |
| `murrmure_list_sessions` | `space:read` **or** `journal:read` | Filter: `status`, `space_id` |
| `murrmure_get_session` | `space:read` | Derived status from child runs |
| `murrmure_create_run` | `flow:run` | Headless: `flow_id: null` |
| `murrmure_get_run` | `space:read` | Step memo + journal replay |
| `murrmure_get_run_context` | `space:read` | Run + active step-contract context |
| **`murrmure_list_step_contracts`** | **`space:read`** | `{ run_id }` → active slice + `graph_digest` |
| `murrmure_get_run_graph` | `flow:read` | Digest-pinned live/history graph with authorized contracts and safe resolver identity |
| `murrmure_attach_orchestration` | `flow:run` | Ephemeral session graph attach |
| `murrmure_cancel_run` | `flow:run` | Terminal runs reject restart |

## Space, handlers, events

| Tool | Capability | Notes |
|------|------------|-------|
| `murrmure_apply_space` | `space:write` | POST index apply |
| `murrmure_space_status` | `space:read` | Indexed counts + digests |
| `murrmure_space_health` | `space:read` | Health summary, handler coverage |
| **`murrmure_list_handlers`** | **`space:read`** | Handler ids + `contract_keys` + `type` |
| **`murrmure_list_emittable_events`** | **`event:emit`** | Allowed event types + payload schema |
| **`murrmure_emit_event`** | **`event:emit`** | `{ type, source, data }` — v2 event surface |
| **`murrmure_resolve_step`** | **`step:resolve`** | `{ run_id, step_id, branch, payload?, artifacts_out? }` |
| **`murrmure_open_child_step`** | **`step:resolve`** | Yield parent and open one direct declared child with idempotency |

## Wait & journal

| Tool | Capability | Pattern |
|------|------------|---------|
| `murrmure_wait_for_run` | `space:read` | Long-poll until run advances or terminal |
| `murrmure_journal_query` | `journal:read` | `GET /v1/journal?session=ses_*&type=mrmr.step.*` |

## Typical agent flow

1. `murrmure_space_health` + `murrmure_list_handlers` — pre-flight
2. `murrmure_get_run_context` — active step + input
3. `murrmure_list_step_contracts` — branches and schemas
4. Do work (handler prompt or task)
5. **`murrmure_resolve_step`** — `{ run_id, step_id, branch, payload }`
6. **`murrmure_wait_for_run`** — human or downstream handler
7. `murrmure_get_run` — inspect outputs when needed

For a nested parent, replace step 5 with `murrmure_open_child_step` and stop the
yielded assignment. Child return produces a fresh parent assignment with
`returned_child`.

Re-read **`active-step-contract.json`** (path in `MURRMURE_ACTIVE_STEP_CONTRACT_PATH`) after transitions in long shell sessions.

## v1 → v2 identity

| v1 | Use instead |
|----|-------------|
| `instance_id` | `run_id` (`run_*`; `ins_*` shim on read) |
| `state:transition` | `flow:run` + handler dispatch + `murrmure_resolve_step` |
| v1 `emit_event` | **`murrmure_emit_event`** |

## Removed tools

`murrmure_complete_action`, the removed public invoke MCP tool,
`murrmure_wait_for_gate`, `murrmure_resolve_gate`, and
`murrmure_grant_mint` — use handlers + **`murrmure_resolve_step`** and manage
local authorization with `mrmr connection`.

Local MCP config uses the stable launcher plus `--hub` and `--connection`; it
contains no token environment entry. A hub bearer token is allowed only as
runtime secret injection in explicit headless CI mode.
