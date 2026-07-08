# MCP platform tools (rev-1 §10.9)

Murrmure exposes grant-filtered MCP tools via `murrmure mcp` → `POST /v1/mcp/tools/call`.

Platform tools are filtered by grant **capabilities** (scopes). Indexed flow work uses **`murrmure_invoke_action`** and gate/run wait tools — not per-package mount tool names.

## Cross-space query

| Tool | Capability | Description |
|------|------------|-------------|
| `query_ask` | `space:read` | Typed cross-space query. Implemented: `spec_summary@1`. Requires target space `query_policy.inbound_allowlist`. |

Example arguments:

```json
{
  "target_space_id": "spc_orchestrator",
  "query_type": "spec_summary@1",
  "params": { "spec_key": "ins_…" }
}
```

## v2 session & run tools (batch 1)

| Tool | Capability | HTTP |
|------|------------|------|
| `murrmure_create_session` | `flow:run` or `action:invoke` | `POST /v1/sessions` |
| `murrmure_list_sessions` | `space:read` or `journal:read` | `GET /v1/sessions` |
| `murrmure_get_session` | `space:read` | `GET /v1/sessions/{id}` |
| `murrmure_create_run` | `flow:run` | `POST /v1/sessions/{id}/runs` |
| `murrmure_get_run` | `space:read` | `GET /v1/runs/{id}` |
| `murrmure_get_run_graph` | `flow:read` | `GET /v1/runs/{id}/graph` |
| `murrmure_attach_orchestration` | `flow:run` | `POST /v1/sessions/{id}/orchestration/attach` |
| `murrmure_cancel_run` | `gate:resolve` | `POST /v1/runs/{id}/cancel` |

## Space & invoke tools

| Tool | Capability | HTTP |
|------|------------|------|
| `murrmure_apply_space` | `space:write` | `POST /v1/spaces/{id}/apply` |
| `murrmure_space_status` | `space:read` | `GET /v1/spaces/{id}/index/status` |
| `murrmure_grant_mint` | `space:admin` | `POST /v1/spaces/{id}/grants` |
| `murrmure_invoke_action` | `action:invoke` | `POST /v1/spaces/{id}/actions/{name}/invoke` |
| `murrmure_complete_action` | `action:invoke` | `POST /v1/runs/{id}/steps/{step_id}/complete` — opaque `result` bag merged into `exec_context.steps.{step}.output` |

## v2 wait & journal tools (batch 2)

| Tool | Capability | HTTP |
|------|------------|------|
| `murrmure_wait_for_gate` | `space:read` | long-poll `GET /v1/gates/wait` |
| `murrmure_resolve_gate` | `gate:resolve` | `POST /v1/gates/{id}/resolve` |
| `murrmure_wait_for_run` | `space:read` | long-poll `GET /v1/runs/wait` |
| `murrmure_journal_query` | `journal:read` | `GET /v1/journal?…` |

See [Connect your agent](../guide/agents-mcp) for grant setup.

## User preferences

`PATCH /v1/me` with `{ "landing_space_id": "spc_…" }` — CLI: `mrmr me set-landing --space spc_…`

## Removed v1 platform tools

`get_space_state`, `transition`, `wait_for_state`, `emit_event`, `contract_versions` — **fully removed** (phase 16). Use v2 tools above; verify connectivity with **`murrmure_space_status`**.

## Identity

- Prefer **`run_id`** (`run_*`) over v1 **`instance_id`** (`ins_*`). Both accepted on read paths during migration.
- `murrmure_get_run` accepts `run_id` or `instance_id` argument.

See `studio-specs/current/bridges/grants-migration.md` for scope → capability mapping.
