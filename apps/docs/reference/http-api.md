# HTTP API overview

::: tip Who is this for?
**Integrators and automation authors** — not reviewers, admins, or agent operators.

Day-to-day Studio use is **browser (Configure + Runtime)** and **MCP**. You should not need curl for spaces, grants, capabilities, reviews, or feature specs.
:::

Studio Cloud exposes a REST API at **`https://api.studio.dev`**. Self-hosted teams use their hub URL.

## Authentication

```
Authorization: Bearer tok_<your_grant_token>
```

Tokens come from **Configuration → Agent access**. Browser login is separate.

## Platform API (`/v1/*`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/health` | Status (no auth) |
| `POST` | `/v1/spaces` | Create space (admin token) |
| `GET` | `/v1/spaces/{id}` | Get space |
| `GET` | `/v1/spaces/{id}/instances` | List instances |
| `POST` | `/v1/spaces/{id}/instances` | Create instance |
| `GET` | `/v1/spaces/{id}/instances/{ins}` | Get instance |
| `PATCH` | `/v1/spaces/{id}/instances/{ins}/metadata` | Metadata patch |
| `POST` | `/v1/spaces/{id}/instances/{ins}/transitions` | Transition |
| `GET` | `/v1/spaces/{id}/gates` | Pending gates |
| `POST` | `/v1/spaces/{id}/gates/{gate}/resolve` | Resolve gate |
| `GET` | `/v1/spaces/{id}/events` | Event tail |
| `GET` | `/v1/spaces/{id}/events/subscribe` | SSE |
| `GET` | `/v1/spaces/{id}/audit/export` | Audit JSONL |

Mutating requests: optional `Idempotency-Key` header.

Path `space_id` must match token scope (unless admin bootstrap on self-hosted).

## Configuration API (CS0)

Admin and setup routes — require appropriate scopes (`space:admin`, `capability:install`, etc.).

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/auth/whoami` | any valid token | Actor, spaces, scopes |
| `GET` | `/v1/spaces` | `space:enter` | List granted spaces |
| `PATCH` | `/v1/spaces/{id}` | `space:admin` | Update space settings |
| `POST` | `/v1/spaces/{id}/archive` | `space:admin` | Archive space |
| `GET` | `/v1/spaces/{id}/capabilities` | `space:read` | List installs |
| `POST` | `/v1/spaces/{id}/capabilities/install` | `capability:install` | Install capability |
| `GET` | `/v1/spaces/{id}/capabilities/{install}` | `space:read` | Install detail |
| `PATCH` | `/v1/spaces/{id}/capabilities/{install}/config` | `capability:configure` | Update config |
| `POST` | `/v1/spaces/{id}/evolution/validate` | `capability:install` | Lens A validate |
| `POST` | `/v1/spaces/{id}/evolution/test` | `capability:install` | Contract tests |
| `POST` | `/v1/spaces/{id}/evolution/promote` | `capability:install` | Promote (may gate) |
| `POST` | `/v1/spaces/{id}/evolution/rollback` | `capability:install` | Rollback version |
| `GET` | `/v1/spaces/{id}/contracts/diff` | `space:read` | Contract diff summary |
| `GET` | `/v1/spaces/{id}/members` | `space:admin` | List members |
| `POST` | `/v1/spaces/{id}/members` | `space:admin` | Invite member |
| `PATCH` | `/v1/spaces/{id}/members/{id}` | `space:admin` | Update role |
| `DELETE` | `/v1/spaces/{id}/members/{id}` | `space:admin` | Remove member |
| `GET` | `/v1/spaces/{id}/grants` | `space:admin` | List grants |
| `POST` | `/v1/spaces/{id}/grants` | `space:admin` | Mint grant (returns one-time token; optional `capability_acl`) |
| `POST` | `/v1/spaces/{id}/grants/{id}/revoke` | `space:admin` | Revoke grant |
| `POST` | `/v1/spaces/{id}/grants/{id}/rotate` | `space:admin` | Rotate grant |
| `GET` | `/v1/spaces/{id}/triggers` | `space:read` | List triggers |
| `POST` | `/v1/spaces/{id}/triggers` | `trigger:register` | Register trigger (custom filter/action) |
| `GET` | `/v1/spaces/{id}/triggers/event-catalog` | `space:read` | Event types from live capability contracts |
| `GET` | `/v1/spaces/{id}/triggers/templates` | `space:read` | Bundled trigger templates |
| `POST` | `/v1/spaces/{id}/triggers/from-template` | `trigger:register` | Register from template (`spec-published-wake-dev`, …) |
| `POST` | `/v1/spaces/{id}/triggers/{id}/test-fire` | `trigger:register` | Synthetic event → delivery (debug) |
| `POST` | `/v1/spaces/{id}/triggers/{id}/disable` | `trigger:register` | Disable trigger |
| `POST` | `/v1/spaces/{id}/triggers/{id}/replay` | `trigger:register` | Replay a past delivery |
| `GET` | `/v1/spaces/{id}/triggers/deliveries` | `space:read` | Delivery log |
| `GET` | `/v1/ops/grants/export` | hub operator | Hub-wide grant export |
| `GET` | `/v1/ops/federation/status` | `space:admin` | Relay status |

`PATCH /v1/spaces/{id}` accepts `query_policy` (e.g. `{ inbound_allowlist: ["spc_dev"] }`) for cross-space query policy. Configure UI for query policy is not shipped yet — use the API or hub admin tools.

## Cross-space queries (`/v1/spaces/{id}/queries/*`)

Typed asks from the caller's space into another space. Requires `space:read` on the caller's token.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `POST` | `/v1/spaces/{id}/queries/ask` | `space:read` | `{ target_space_id, query_type, params?, timeout_ms? }` |
| `GET` | `/v1/spaces/{id}/queries/{query_id}` | `space:read` | Fetch stored query record |

Supported `query_type` values:

| Type | Target | Notes |
|------|--------|-------|
| `spec_summary@1` | feature-spec space | Summary fields only; **`body_ref` stripped** from response |

Denials: `QUERY_POLICY_DENIED` when source space is not on target `query_policy.inbound_allowlist`. MCP: **`query_ask`**.

## Capability runtime (self-hosted hub)

Live mount and MCP bridge routes. Agents on `human_only` spaces cannot apply; agents without `capability:install` cannot apply live mounts.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/spaces/{id}/capabilities/live` | `space:read` | Live mounts in the space |
| `POST` | `/v1/spaces/{id}/capabilities/{install}/apply` | `capability:install` | Mount capability routes + refresh MCP catalog |
| `POST` | `/v1/spaces/{id}/capabilities/{install}/unmount` | `capability:install` | Remove live mount |

### MCP bridge (`/v1/mcp/*`)

Used by the hub daemon MCP integration (and `@studio/hub-mcp` when pointed at a self-hosted hub). Pass `space_id` as a query param or in the JSON body.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/mcp/catalog?space_id=` | token scopes + `capability_acl` | Grant-filtered tool list |
| `POST` | `/v1/mcp/session/handshake` | valid token | Control-bus ack + replay from `last_ack_seq` |
| `POST` | `/v1/mcp/tools/call?space_id=` | per-tool scope + ACL | Invoke a tool by name |
| `POST` | `/v1/mcp/wake` | valid token | Push `mcp_wake` to a connected MCP client |

Grant **`capability_acl`** (e.g. `["review-loop", "feature-spec"]`) limits which installed capability tools appear in the catalog, even when scopes would otherwise allow them.

## Review API (`/api/sessions/*`)

Requires **review-loop** capability installed and applied live in the space.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Create session |
| `GET` | `/api/sessions` | List summaries |
| `GET` | `/api/sessions/{key}` | Session JSON |
| `POST` | `/api/sessions/{key}/comments` | Add comment |
| `POST` | `/api/sessions/{key}/finish` | Finish round |
| `POST` | `/api/sessions/{key}/review-cycle` | Long-poll |

Most integrators should use **MCP** instead of raw HTTP — see [MCP tools](./mcp-tools). Humans use the [browser app](../guide/browser).

## Feature-spec API (`/api/specs/*`)

Requires **feature-spec** capability installed, applied live, and a grant with `capability_acl` including `feature-spec`.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/api/specs` | `space:read` | List spec instances |
| `POST` | `/api/specs` | `state:transition` | Create spec (`open_spec`) |
| `GET` | `/api/specs/{key}` | `space:read` | Full `SpecJson` |
| `PATCH` | `/api/specs/{key}/sections/{id}` | `state:transition` | Update one section |
| `POST` | `/api/specs/{key}/context-refs` | `state:transition` | Add context reference (v1.1+) |
| `POST` | `/api/specs/{key}/transition` | `state:transition` | Any contract transition event |
| `POST` | `/api/specs/{key}/publish` | `state:transition` | Publish (`publish_direct` or `approve_spec`); optional `Idempotency-Key` |
| `GET` | `/api/specs/query/spec_summary` | `space:read` | Inbound query handler (summary only, no body) |

Install config keys: `skip_review` (bool), `required_approver_role`, `default_target_repo`. When `skip_review` is `false`, `publish_direct` returns `403 TRANSITION_GUARD_FAILED`.

Published specs emit **`spec.published`** on the space event tail (`payload.type === "spec.published"`).

Shell UI: `/spaces/{space_id}/specs/{spec_key}`.

## Errors

| HTTP | Code | Meaning |
|------|------|---------|
| 403 | `TOKEN_DENIED` | Bad or revoked token |
| 403 | `SCOPE_ENFORCEMENT_FAILURE` | Token not valid for this space or missing scope |
| 403 | `INSTALL_POLICY_VIOLATION` | Agent install blocked by space policy |
| 403 | `TOOL_NOT_AUTHORIZED` | MCP tool missing scope or not in grant `capability_acl` |
| 403 | `TRANSITION_GUARD_FAILED` | Capability guard (e.g. `publish_direct` when `skip_review: false`) |
| 403 | `QUERY_POLICY_DENIED` | Cross-space ask blocked by target `inbound_allowlist` |
| 403 | `LIVE_APPLY_FAILED` | Live mount could not be applied |
| 409 | — | Revision conflict; retry with current revision |
