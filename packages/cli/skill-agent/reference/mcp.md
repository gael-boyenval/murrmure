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
| **`murrmure_list_personas`** | **`space:read`** | Same-space persona ads |
| **`murrmure_start_meeting`** | **`flow:run`** | Convene a room (`participants`, `chair`) |
| **`murrmure_meeting_transcript`** | roster space or **`journal:read`** on a roster space | `GET /v1/sessions/{id}/transcript` — pull `mrmr.meeting.*` with `since_seq`. Not `journal_query`. |
| **`murrmure_list_emittable_events`** | **`event:emit`** | Allowed event types + payload schema |
| **`murrmure_emit_event`** | **`event:emit`** | `{ event_type, payload, session_id? }` — journal-first; `session_id` required for `mrmr.meeting.*` |
| **`murrmure_resolve_step`** | **`step:resolve`** | `{ run_id, step_id, branch, payload?, artifacts_out? }` |
| **`murrmure_open_child_step`** | **`step:resolve`** | Yield parent and open one direct declared child with idempotency |

## Wait & journal

| Tool | Capability | Pattern |
|------|------------|---------|
| `murrmure_wait_for_run` | `space:read` | Long-poll until run advances or terminal |
| `murrmure_journal_query` | `journal:read` | `GET /v1/journal?session=ses_*&type=mrmr.step.*` |

## Typical agent flow

**Meeting seat** (`Protocol: murrmure.meeting/v1` already in the prompt):

1. `murrmure_meeting_transcript` with the prompt `session_id` + `since_seq` — pull, do not paste the journal
2. Do the Task (handler `prompt`)
3. **`murrmure_emit_event`** `mrmr.meeting.said` with top-level `session_id`
4. Do **not** `murrmure_resolve_step` the room

**Handler assignment** (`Protocol: murrmure.agent/v1` already in the prompt):

1. Do the Task from the prompt
2. **`murrmure_resolve_step`** using the Contracts block (live IDs)
3. Stop — do not pre-flight with `space_health` / `list_handlers` / pending wake

**Interactive** (human asked you to operate a run; no assignment prompt):

1. Optional: `murrmure_space_health` + `murrmure_list_handlers` — only when debugging apply/coverage
2. `murrmure_get_run_context` — active step + input
3. `murrmure_list_step_contracts` — branches and schemas
4. Do work
5. **`murrmure_resolve_step`** — `{ run_id, step_id, branch, payload }`
6. **`murrmure_wait_for_run`** — human or downstream handler
7. `murrmure_get_run` — inspect outputs when needed

For a nested parent, replace resolve with `murrmure_open_child_step` and stop the
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

Local MCP config uses the stable launcher plus `--connection <con_…>` (no
`--hub`, no token environment entry). The bridge resolves Hub from discovery
and the credential from Keychain for that connection. A hub bearer token is
allowed only as runtime secret injection in explicit headless CI mode.
