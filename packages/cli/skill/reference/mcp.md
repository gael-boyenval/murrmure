# MCP tools (agent reference)

Grant-filtered tools from `/v1/mcp/catalog`. Reload MCP after grant mint or `mrmr space apply`.

## v2 batch 1 — session & run

| Tool | Capability | Notes |
|------|------------|-------|
| `murrmure_create_session` | `flow:run` **or** `action:invoke` | Returns `ses_*` |
| `murrmure_list_sessions` | `space:read` **or** `journal:read` | Filter: `status`, `space_id` |
| `murrmure_get_session` | `space:read` | Derived status from child runs |
| `murrmure_create_run` | `flow:run` | Headless: `flow_id: null` |
| `murrmure_get_run` | `space:read` | Includes step memo + journal replay |
| **`murrmure_list_step_contracts`** | **`space:read`** | `{ run_id }` → active `StepContractSlice` + `graph_digest` |
| `murrmure_cancel_run` | `gate:resolve` | Terminal runs reject restart |

## Invoke & space

| Tool | Capability |
|------|------------|
| `murrmure_invoke_action` | `action:invoke` |
| **`murrmure_resolve_step`** | **`step:resolve`** | `{ run_id, step_id, branch, payload?, artifacts_out? }` → `POST /v1/runs/{id}/steps/{step_id}/resolve` |
| ~~`murrmure_complete_action`~~ | `action:invoke` | **Deprecated for flow steps** (VS-8 removes) — use `murrmure_resolve_step` |
| `murrmure_apply_space` | `space:write` |
| `murrmure_space_status` | `space:read` |
| `murrmure_grant_mint` | `space:admin` |

## v1 → v2 scope mapping

| v1 scope | Use instead |
|----------|-------------|
| `state:transition` | `flow:run` + `action:invoke` |
| `event:read` | `journal:read` |
| `event:emit` | invoke / journal |
| `instance_id` arg | `run_id` (`run_*`; `ins_*` shim) |

Full map: [grants-migration.md](grants-migration.md) in studio-specs bridges.

## Typical agent flow

1. `murrmure_create_session` — correlation context
2. `murrmure_create_run` — headless or flow-backed
3. `murrmure_invoke_action` — pass `session_id`, `run_id`, `step_id: action:{name}`
4. **`murrmure_resolve_step`** — complete active flow step: `{ run_id, step_id, branch, payload }` (replaces `complete_action` for step_contract flows)
5. Re-read **`active-step-contract.json`** after transitions in long shell sessions (path in `MURRMURE_ACTIVE_STEP_CONTRACT_PATH`)
6. **`murrmure_list_step_contracts`** — optional discovery: `{ run_id }` returns active slice + `graph_digest`
7. `murrmure_get_run` — poll step memo until terminal

## v2 batch 2 — gates & journal

| Tool | Capability | Pattern |
|------|------------|---------|
| `murrmure_wait_for_gate` | `space:read` | Long-poll until pending gate on `run_id` / `session_id` |
| `murrmure_resolve_gate` | `gate:resolve` | `POST /v1/gates/{id}/resolve` with `{ disposition, output }` (legacy `decision` shim) |
| `murrmure_wait_for_run` | `space:read` | Long-poll until run lifecycle terminal |
| `murrmure_journal_query` | `journal:read` | `GET /v1/journal?session=ses_*&type=mrmr.gate.*` |

Prefer `murrmure_wait_for_gate` / `murrmure_wait_for_run` over v1 `wait_for_state`.

## v2 batch 3 — orchestration attach

| Tool | Capability | Pattern |
|------|------------|---------|
| `murrmure_attach_orchestration` | `flow:run` | Push `murrmure.flow.attach/v1`; creates `orchestration.validate` gate |
| `murrmure_get_run_graph` | `flow:read` | Preview graph before approve (`GET /v1/runs/{id}/graph`) |

**File-push vs MCP attach:** durable flows → `murrmure_apply_space` / `mrmr space apply`; ephemeral session plan → attach. See [orchestration-attach.md](orchestration-attach.md).

Landing space (human shell): `mrmr me set-landing --space spc_…` → `PATCH /v1/me`.
