# MCP tools

Package: **`@murrmure/cli`** — the primary way agents talk to Murrmure.

Humans use the **[browser app](../guide/browser)** (Configure + Runtime). This reference is for **agent operators** wiring MCP.

Config comes from **Configure → Agent grants** or the **`/setup`** wizard MCP snippet.

On a **self-hosted hub**, the daemon exposes the same tools over HTTP at `/v1/mcp/*` (see [HTTP API](./http-api#mcp-bridge-v1mcp)).

## Environment

| Variable | Description |
|----------|-------------|
| `MURRMURE_HUB_URL` | API base, e.g. `https://api.murrmure.dev` or `http://127.0.0.1:8787` |
| `MURRMURE_HUB_TOKEN` | Grant token `tok_…` |
| `MURRMURE_SPACE_ID` | Default space — **not** passed in most tool args |

Legacy aliases: `STUDIO_API_URL`, `STUDIO_API_TOKEN`, and FDK `MURRMURE_TOKEN` (for the token only).

## Grant-filtered catalog

The hub builds your tool list from:

1. **Scopes** on the grant token (`space:read`, `state:transition`, …)
2. **`flow_acl`** on the grant — which installed packages you may use (e.g. `["review-loop", "feature-spec"]`)
3. **Live mounts** — flow must be installed *and* applied live in the space

Platform tools (e.g. `transition`) never imply domain tools (`open_spec`, `create_review_session`) unless the package is in `flow_acl` and live.

Mint grants with explicit ACL when using multiple flows:

```json
{
  "label": "spec-agent",
  "scopes": ["space:read", "state:transition", "event:emit", "blob:write"],
  "flow_acl": ["feature-spec"]
}
```

`flow:install` is required to **install or apply** flows, not to call domain tools once live.

Domain **`instance.create`** (e.g. `open_spec`) is allowed with **`state:transition`** when using a flow contract — you do not need `flow:install` on worker grants.

## Reconnect / handshake

After MCP reconnect, call **`POST /v1/mcp/session/handshake`** with:

```json
{
  "space_id": "spc_…",
  "client_id": "cursor-main",
  "last_ack_seq": 42
}
```

The server returns fresh `server_tools[]`, contract versions, and drains missed control messages (tool refresh, wake labels) from the durable outbox.

Platform tool: **`contract_versions`** — pinned contract refs for the space.

## Platform tools

| Tool | Scope | Description |
|------|-------|-------------|
| `get_space_state` | `space:read` | `{ instance_id }` → state + pending gates |
| `transition` | `state:transition` | `{ instance_id, event, expected_revision }` |
| `emit_event` | `event:emit` | `{ instance_id, event_type, payload? }` |
| `wait_for_state` | `state:transition` | `{ instance_id, condition, timeout_ms? }` |
| `contract_versions` | `space:read` | `{}` → pinned contracts after reconnect |
| `query_ask` | `space:read` | `{ target_space_id, query_type, params?, timeout_ms? }` — cross-space typed query |

### Cross-space `query_ask`

Use when an agent in one space needs **scoped data** from another space without a write token there.

| `query_type` | Target flow | Returns |
|--------------|-------------------|---------|
| `spec_summary@1` | feature-spec (live) | `title`, `version`, `summary`, `section_count`, `published_at` — **no `body_ref`** |

The target space may deny the ask via `query_policy.inbound_allowlist`. Wake payloads from triggers also omit `body_ref`; woken agents fetch detail with `query_ask` or `get_spec` in the source space when they hold a read grant there.

HTTP equivalent: `POST /v1/spaces/{id}/queries/ask`.

## Review tools (`review-loop`)

Requires live **review-loop** install + `flow_acl` including `review-loop`.

| Tool | Scope | Description |
|------|-------|-------------|
| `create_review_session` | `state:transition` | `{ view?, url?, title?, assigned_reviewer? }` |
| `get_session` | `space:read` | `{ session_key }` |
| `wait_for_review` | `state:transition` | `{ session_key, timeout_ms? }` |

HTTP equivalents: `/api/sessions/*`.

## Feature-spec tools (`feature-spec`)

Requires live **feature-spec** install + `flow_acl` including `feature-spec`.

| Tool | Scope | Description |
|------|-------|-------------|
| `open_spec` | `state:transition` | `{ title?, target_repo? }` → new spec in `gathering_context` |
| `get_spec` | `space:read` | `{ spec_key }` → full `SpecJson` |
| `patch_spec_section` | `state:transition` | `{ spec_key, section_id, title, body, order }` |
| `add_context_ref` | `state:transition` | `{ spec_key, kind, ref, label? }` (v1.1+) |
| `transition_spec` | `state:transition` | `{ spec_key, event, expected_revision? }` |
| `publish_spec` | `state:transition` | `{ spec_key, event? }` shorthand for publish transition |

Typical flow: `open_spec` → `patch_spec_section` (×N) → optional `add_context_ref` → `transition_spec` (`context_ready`) → human **`publish`** (shell or HTTP) → journal event `spec.published` → optional trigger **`mcp_wake`** → downstream **`query_ask`** / **`get_spec`**.

HTTP equivalents: `/api/specs/*`. Shell canvas: `/spaces/{space_id}/specs/{spec_key}`.

## Cursor example

Paste from dashboard, or:

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "https://api.murrmure.dev",
        "MURRMURE_HUB_TOKEN": "tok_…",
        "MURRMURE_SPACE_ID": "spc_…"
      }
    }
  }
}
```

## Setup guide

[Connect your agent](../guide/agents-mcp)
