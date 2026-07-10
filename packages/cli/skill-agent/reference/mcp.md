# MCP tools (agent reference)

Grant-filtered tools from `/v1/mcp/catalog`. Reload MCP after grant mint or `mrmr space apply`.

## Cross-space query

| Tool | Capability | Notes |
|------|------------|-------|
| `query_ask` | `space:read` | Typed cross-space query (`spec_summary@1`). Target space needs inbound allowlist. |

## Session & run

| Tool | Capability | Notes |
|------|------------|-------|
| `murrmure_create_session` | `flow:run` **or** `action:invoke` | Returns `ses_*` |
| `murrmure_list_sessions` | `space:read` **or** `journal:read` | Filter: `status`, `space_id` |
| `murrmure_get_session` | `space:read` | Derived status from child runs |
| `murrmure_create_run` | `flow:run` | Headless: `flow_id: null` |
| `murrmure_get_run` | `space:read` | Step memo + journal replay |
| `murrmure_get_run_context` | `space:read` | Run + active step-contract context |
| **`murrmure_list_step_contracts`** | **`space:read`** | `{ run_id }` → active slice + `graph_digest` |
| `murrmure_get_run_graph` | `flow:read` | Preview graph |
| `murrmure_attach_orchestration` | `flow:run` | Ephemeral session graph attach |
| `murrmure_cancel_run` | `gate:resolve` | Terminal runs reject restart |

## Space, handlers, events

| Tool | Capability | Notes |
|------|------------|-------|
| `murrmure_apply_space` | `space:write` | POST index apply |
| `murrmure_space_status` | `space:read` | Indexed counts + digests |
| `murrmure_space_health` | `space:read` | Health summary, handler coverage |
| `murrmure_grant_mint` | `space:admin` | Mint capabilities |
| **`murrmure_list_handlers`** | **`space:read`** | Handler ids + `contract_keys` + `type` |
| **`murrmure_list_emittable_events`** | **`event:emit`** | Allowed event types + payload schema |
| **`murrmure_emit_event`** | **`event:emit`** | `{ type, source, data }` — v2 event surface |
| **`murrmure_resolve_step`** | **`step:resolve`** | `{ run_id, step_id, branch, payload?, artifacts_out? }` |

`murrmure_invoke_action` remains for legacy/debug paths — **not** the primary flow-step completion path after handler cutover.

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

Re-read **`active-step-contract.json`** (path in `MURRMURE_ACTIVE_STEP_CONTRACT_PATH`) after transitions in long shell sessions.

## v1 → v2 identity

| v1 | Use instead |
|----|-------------|
| `instance_id` | `run_id` (`run_*`; `ins_*` shim on read) |
| `state:transition` | `flow:run` + handler dispatch + `murrmure_resolve_step` |
| v1 `emit_event` | **`murrmure_emit_event`** |

## Removed tools

`murrmure_complete_action`, `murrmure_wait_for_gate`, `murrmure_resolve_gate` — use **`murrmure_resolve_step`** + **`murrmure_wait_for_run`**.

MCP env: `MURRMURE_HUB_TOKEN`. CLI defaults: `MURRMURE_HUB_URL`, optional `MURRMURE_SPACE_ID`.
