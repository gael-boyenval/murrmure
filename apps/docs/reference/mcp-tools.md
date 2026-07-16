# MCP platform tools (rev-1 §10.9)

Murrmure exposes grant-filtered MCP tools via `murrmure-mcp` (`@murrmure/mcp-bridge`) → `POST /v1/mcp/tools/call`.

Platform tools are filtered by grant **capabilities** (scopes). Flow step completion uses **`murrmure_resolve_step`** — not legacy complete-action or gate-wait tools.

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
| `murrmure_create_session` | `flow:run` | `POST /v1/sessions` |
| `murrmure_list_sessions` | `space:read` or `journal:read` | `GET /v1/sessions` |
| `murrmure_get_session` | `space:read` | `GET /v1/sessions/{id}` |
| `murrmure_create_run` | `flow:run` | `POST /v1/sessions/{id}/runs` |
| `murrmure_get_run` | `space:read` | `GET /v1/runs/{id}` |
| `murrmure_get_run_context` | `space:read` | `murrmure_get_run` + active step-contract context when available |
| **`murrmure_list_step_contracts`** | **`space:read`** | **`GET /v1/runs/{id}/step-contracts`** — active slice + `graph_digest` |
| `murrmure_get_run_graph` | `flow:read` | `GET /v1/runs/{id}/graph` |
| `murrmure_attach_orchestration` | `flow:run` | `POST /v1/sessions/{id}/orchestration/attach` |
| `murrmure_cancel_run` | `flow:run` | `POST /v1/runs/{id}/cancel` |

## Space & invoke tools

| Tool | Capability | HTTP |
|------|------------|------|
| `murrmure_apply_space` | `space:write` | `POST /v1/spaces/{id}/apply` |
| `murrmure_space_status` | `space:read` | `GET /v1/spaces/{id}/index/status` |
| `murrmure_space_health` | `space:read` | Health summary (index counts, handler coverage, warnings) |
| `murrmure_list_handlers` | `space:read` | List indexed handler ids + `contract_keys` |
| `murrmure_list_emittable_events` | `space:read` | Event types this space can emit (from hook index) |
| `murrmure_emit_event` | `event:emit` | Emit platform event `{ type, source?, data? }` |
| `murrmure_grant_mint` | `space:admin` | `POST /v1/spaces/{id}/grants` |
| **`murrmure_resolve_step`** | **`step:resolve`** | **`POST /v1/runs/{id}/steps/{step_id}/resolve`** — branch + payload; local clients may pass workdir-relative `artifacts_out`, remote clients pass an authorized `upload_intent_id` reference |
| **`murrmure_open_child_step`** | **`step:resolve`** | Yield the assigned parent and open one direct declared child. Requires `run_id`, `parent_step_id`, `child_step_id`, and `idempotency_key`; accepts no input payload. |

## v2 wait & journal tools (batch 2)

| Tool | Capability | HTTP |
|------|------------|------|
| `murrmure_wait_for_run` | `space:read` | long-poll `GET /v1/runs/wait` |
| `murrmure_journal_query` | `journal:read` | `GET /v1/journal?…` |

See [Connect your agent](../guide/agents-mcp) for grant setup.

### Handler & event tool examples

`murrmure_list_handlers` response shape:

```json
{
  "handlers": [
    {
      "id": "feature_write_spec",
      "contract_keys": ["preview-review.write_spec"],
      "on": "step.opened",
      "type": "shell_spawn",
      "complete": "explicit"
    }
  ]
}
```

`murrmure_emit_event` arguments:

```json
{
  "type": "brief.published",
  "source": "orchestrator",
  "data": { "spec_key": "ins_…" }
}
```

## User preferences

`PATCH /v1/me` with `{ "landing_space_id": "spc_…" }` — CLI: `mrmr me set-landing --space spc_…`

## Removed v1 platform tools

`get_space_state`, `transition`, `wait_for_state`, `contract_versions` — **fully removed** (phase 16).

The v1 tool name **`emit_event`** is removed. Use v2 **`murrmure_emit_event`** (`event:emit` capability) for platform event emission. Author event reactions in `.mrmr/space/handlers.yaml` with `on: event:` — see [Space handlers](../guide/space-handlers).

## Removed VS-8 flow step tools

Legacy complete-action and gate-wait MCP tools — **fully removed**. Use **`murrmure_resolve_step`** and **`murrmure_wait_for_run`**.

Orchestration approval gates remain on the HTTP API (`POST /v1/gates/{id}/resolve`) for operator attach flows — not exposed as MCP tools.

## Identity

- Prefer **`run_id`** (`run_*`) over v1 **`instance_id`** (`ins_*`). Both accepted on read paths during migration.
- `murrmure_get_run` accepts `run_id` or `instance_id` argument.

See `studio-specs/current/bridges/grants-migration.md` for scope → capability mapping.
