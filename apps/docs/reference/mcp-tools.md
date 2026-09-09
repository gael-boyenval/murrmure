# MCP platform tools (rev-1 §10.9)

Murrmure exposes grant-filtered MCP tools via `murrmure-mcp` (`@murrmure/mcp-bridge`) → `POST /v1/mcp/tools/call`. The bridge refetches `/v1/mcp/catalog` on every `tools/list` and emits `tools/list_changed` after a hub replace (`pid`/`started_at` or handshake seq reset). An already-open agent chat may still keep its original snapshot.

Platform tools are filtered by grant **capabilities** (scopes). Flow step completion uses **`murrmure_resolve_step`** — not legacy complete-action or gate-wait tools.

## Memory tools (Hub-proxied)

These are **not** `murrmure_*` tools. When Hub has started the memory child, they appear on the same Murrmure connection if the grant has `memory:read` / `memory:write`. Hub sets `bank` from the space’s `memory_bank`. Cross-bank calls are denied. `space.yaml` `memory_tags` is the inbound tag grant: retain rejects unknown tags; recall / reflect / recent apply that grant as the visibility filter (or intersect with the agent’s `TagFilter`). Omit the filter only when the space granted all scopes. Empty `tags: []` is the empty scope, not “no filter”. Hub starts `memory-mcp` with `--subjects` from `memory_subjects` (or `skills/memory-use/subjects.yaml` when that skill is installed).

The catalog lists the closed lists: granted **tags** (this space) and handbook **subjects** (one shared file) as schema enums and in the tool descriptions. Agents should not need to open `space.yaml` or `subjects.yaml` to pick names. When the handbook is loaded, `retain.subjects` is required.

| Tool | Capability | Notes |
|------|------------|--------|
| `recall` | `memory:read` | Search one bank. Args: `query`, optional `limit`, `when`, `tags` (`{ tags, match?, untagged? }`), `subjects`, `factTypes` |
| `reflect` | `memory:read` | Prose answer from one bank. Same read filters as recall, plus `includeBasedOn` |
| `recent` | `memory:read` | Recent facts in one bank. Optional `limit`, `tags`, `factTypes` |
| `retain` | `memory:write` | Store text as extracted facts. Optional `context`, `documentId`, `mentionedAt`, `tags` (`string[]`), `subjects` |
| `retire` | `memory:write` | Take a fact out of circulation. `id` required, optional `reason` |

`local-tools/v1` does not include these capabilities. Grant them on the connection. Hub starts `memory-mcp` against `$MURRMURE_DATA_DIR/memory.db` when the memory package is on disk (`MURRMURE_MEMORY_PACKAGE_ROOT` or the sibling `memory/` repo). Set `MURRMURE_MEMORY_MCP=0` to disable. Hub reaps that bun child on stop and before re-spawn, so watch / HMR cannot leave extra processes.

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
| `murrmure_list_personas` | `space:read` | Same-space persona ads (`id`, `summary`, `asks`, `requests`) |
| `murrmure_list_directive_eligible` | `hub:admin` | `GET /v1/directives/eligible` — spaces that bind `step.opened::directive.execute`. Default `local-tools/v1` does not see this tool. |
| `murrmure_start_directive` | `hub:admin` | Fan-out `POST /v1/flows/flw_mrmr_directive/run`. Required `prompt`. Optional `space_ids` / `space_id`; omit to start on every currently eligible space. Returns `{ starts: [{ space_id, ok, run_id?, session_id?, error? }] }`. |
| `murrmure_start_meeting` | `flow:run` | `POST /v1/meetings` — convene (`participants`, `chair` required; `title`, `goal`, `session_id` optional) |
| `murrmure_meeting_transcript` | roster space or `journal:read` on a roster space | `GET /v1/sessions/{id}/transcript?since_seq=` — fold `mrmr.meeting.*` only, including message/receipt timestamps and delivery latency. Pull; do not use `murrmure_journal_query` as the chat. |
| `murrmure_get_artifact` | `space:read` + artifact ACL | Materialize `transfer_id` (`artifact_id` accepted as an input alias) into the authenticated space's `.mrmr/dev/inbox/` and return safe verified metadata + relative `local_path` (ACL readers omitted). |
| `murrmure_put_artifact` | `blob:write` (or `space:write`) | Upload bytes (`content` + `name`, max 64 KiB) or a space-relative `path`. Returns `{ transfer_id, digest, name, size_bytes }`. Meeting attach: put → `said` with `artifacts: [xfr_*]` → peer `get_artifact`. |
| `murrmure_list_emittable_events` | `space:read` | Event types this space can emit (from hook index) |
| `murrmure_emit_event` | `event:emit` | Journal-first emit `{ event_type, payload, session_id? }`. Meeting types (`mrmr.meeting.*`) require top-level `session_id`. Hub-authored `convened` / `delivered` / `delivery_failed` are denied. |
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
  "event_type": "brief.published",
  "payload": { "spec_key": "ins_…" },
  "session_id": "ses_…"
}
```

`session_id` is optional for ordinary events (handler delivery still `createSession`). It is **required** for `mrmr.meeting.*`. HTTP `POST /v1/spaces/{id}/events` also requires `event:emit` and returns the real journal `seq`.

`mrmr.meeting.said` data: `{ as_participant_id, to: { participant_ids }|{ all: true }, text, in_reply_to?, artifacts? }`. Hub stamps `from` and mints `msg_*`. After close, further `said` is `MEETING_CLOSED`. Chair may emit `mrmr.meeting.closed`; a human chair uses `POST /v1/sessions/{id}/meeting/say` (Hub stamps `{ human: true }`) and `/meeting/close`.

Seat assignments use `Protocol: murrmure.meeting/v1` (trigger ids + `since_seq`). Pull with `murrmure_meeting_transcript`; reply with `murrmure_emit_event` `said`. Do not `murrmure_resolve_step` the room and do not paste the journal. Later turns arrive as control `murrmure/control.meeting_said` on the live assignment — not a new `invoke_action` and not `pending-wake.json`.

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

Hands-on: [Tutorial 1b — Meetings](../guide/tutorials/02-meetings/).
