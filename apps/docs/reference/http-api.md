# HTTP API overview

::: tip Who is this for?
**Integrators and automation authors** — not reviewers, admins, or agent operators.

Day-to-day Murrmure use is **Murrmure Desktop** and **MCP**. You should not need curl for spaces, grants, flows, reviews, or feature specs.

For terminal automation, prefer **`mrmr`** — see the normative [CLI spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/current/cli/spec.md) (`studio-specs/current/cli/spec.md`) and [CLI guide](../guide/cli.md).
:::

Murrmure exposes a REST API at your **hub URL** (default `http://127.0.0.1:8787` with Desktop).

## Authentication

```
Authorization: Bearer tok_<your_grant_token>
```

Local tools obtain tokens indirectly through `mrmr connection create`; the
credential is stored in the OS store and is not printed. Direct bearer handling
is reserved for protocol integrators, bootstrap, and explicit headless CI.

| Token source | When |
|--------------|------|
| Bootstrap token | Empty hub / Desktop first run — create spaces, mint first grants |
| Minted grant (`tok_…`) | Agents, CI, operators — scoped capabilities + optional `flow_acl` |

Use **`mrmr whoami`** to inspect actor, spaces, and scopes.

## Platform API (`/v1/*`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/health` | Status (no auth) |
| `POST` | `/v1/spaces` | Create space (admin token) |
| `GET` | `/v1/spaces/{id}` | Get space |
| `GET` | `/v1/sessions` | List sessions |
| `POST` | `/v1/sessions` | Create session |
| `GET` | `/v1/sessions/{id}` | Get session |
| `GET` | `/v1/runs/{id}` | Get run (includes step memos; accepts `run_*` or legacy `ins_*`) |
| `GET` | `/v1/runs/{id}/step-contracts` | `space:read` | Active step-contract slice + `graph_digest` |
| `POST` | `/v1/runs/{id}/steps/{step_id}/resolve` | `step:resolve` | Resolve selected branch `{ branch, payload?, upload_intent_id?, artifacts_out?, idempotency_key? }` |
| `POST` | `/v1/runs/{id}/steps/{step_id}/upload-intents` | `step:resolve` | Pre-authorize ordered artifact metadata and reserve quota |
| `PUT` | `/v1/upload-intents/{intent_id}/files/{index}` | `step:resolve` | Transfer one raw file declared by the intent |
| `DELETE` | `/v1/upload-intents/{intent_id}` | `step:resolve` | Cancel an uncommitted upload and release bytes/quota |
| `GET` | `/v1/runs/{id}/graph` | Run flowchart graph (manifest overlay + step memo) |
| `POST` | `/v1/runs/{id}/cancel` | Cancel run |
| `POST` | `/v1/runs/{id}/retry` | Retry failed run from step |
| `GET` | `/v1/runs/{id}/gates` | Orchestration gates for a run |
| `GET` | `/v1/runs/wait?run_id=` | Long-poll until run terminal |
| `POST` | `/v1/gates/{id}/resolve` | Resolve orchestration gate (`flow:run`, space-bound) |
| `GET` | `/v1/gates/wait?run_id=` | Long-poll pending gates |
| `GET` | `/v1/spaces/{id}/events` | Event tail |
| `GET` | `/v1/spaces/{id}/events/subscribe` | SSE (legacy space events) |
| `GET` | `/v1/spaces/{id}/audit/export` | Audit JSONL |

::: warning Retired (v1 instances)
`POST /v1/spaces/{id}/instances`, instance transitions, and related v1 instance routes return **404** (phase 16). Use sessions/runs above and v2 MCP tools (`murrmure_create_session`, `murrmure_get_run`, …).
:::

Mutating requests: optional `Idempotency-Key` header.

Branch-contract failures are `400 CONTRACT_VALIDATION_FAILED` with
`errors: [{ source, path, rule, message }]`; `path` is an RFC 6901 JSON Pointer.
The Hub does not return content, credentials, validator internals, schema paths,
or host paths. The JSON/base64 `/work/upload` route is removed.

Path `space_id` must match token scope (unless admin bootstrap on self-hosted).

## Configuration API (CS0)

Admin and setup routes — require appropriate scopes (`space:admin`, `flow:install`, etc.).

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/auth/whoami` | any valid token | Actor, spaces, scopes |
| `GET` | `/v1/spaces` | `space:enter` | List granted spaces |
| `PATCH` | `/v1/spaces/{id}` | `space:admin` | Update space settings |
| `POST` | `/v1/spaces/{id}/archive` | `space:admin` | Archive space |
| `GET` | `/v1/spaces/{id}/flows` | `space:read` | List indexed flows (v2) |
| `POST` | `/v1/spaces/{id}/apply` | `space:write` | Index `.mrmr/` bundle |
| `GET` | `/v1/spaces/{id}/index/status` | `space:read` | Index digests and counts |

::: warning Retired routes
These routes return **404** in current hub builds: `POST …/flows/install`, `PATCH …/flows/{install}/config`, and all `POST …/evolution/*`. Use **`POST /v1/spaces/{id}/apply`** for v2 indexed flows.
:::

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/spaces/{id}/contracts/diff` | `space:read` | Contract diff summary |
| `GET` | `/v1/spaces/{id}/members` | `space:admin` | List members |
| `POST` | `/v1/spaces/{id}/members` | `space:admin` | Invite member |
| `PATCH` | `/v1/spaces/{id}/members/{id}` | `space:admin` | Update role |
| `DELETE` | `/v1/spaces/{id}/members/{id}` | `space:admin` | Remove member |
| `GET` | `/v1/spaces/{id}/grants` | `space:admin` | List grants |
| `POST` | `/v1/spaces/{id}/grants` | `space:admin` | Mint grant (returns one-time token; optional `flow_acl`) |
| `POST` | `/v1/spaces/{id}/grants/{id}/revoke` | `space:admin` | Revoke grant |
| `POST` | `/v1/spaces/{id}/grants/{id}/rotate` | `space:admin` | Rotate grant |
| `GET` | `/v1/spaces/{id}/triggers` | `space:read` | List triggers |
| `POST` | `/v1/spaces/{id}/triggers` | `trigger:register` | Register trigger (custom filter/action) |
| `GET` | `/v1/spaces/{id}/triggers/event-catalog` | `space:read` | Event types from live flow contracts |
| `GET` | `/v1/spaces/{id}/triggers/templates` | `space:read` | Bundled trigger templates |
| `POST` | `/v1/spaces/{id}/triggers/from-template` | `trigger:register` | Register from template (`spec-published-wake-dev`, …) |
| `POST` | `/v1/spaces/{id}/triggers/{id}/test-fire` | `trigger:register` | Synthetic event → delivery (debug) |
| `POST` | `/v1/spaces/{id}/triggers/{id}/disable` | `trigger:register` | Disable trigger |
| `POST` | `/v1/spaces/{id}/triggers/{id}/replay` | `space:admin` | Replay a past delivery |
| `GET` | `/v1/spaces/{id}/triggers/deliveries` | `space:read` | Delivery log |
| `GET` | `/v1/ops/grants/export` | `space:admin` | Hub-wide grant export |
| `GET` | `/v1/ops/federation/status` | `space:admin` | Relay status |

`PATCH /v1/spaces/{id}` accepts `query_policy` (e.g. `{ inbound_allowlist: ["spc_dev"] }`) for cross-space query policy. Use **`mrmr space update --query-policy`** or the API — there is no Configure UI.

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

## Flow runtime (self-hosted hub)

Live mount and MCP bridge routes. Agents on `human_only` spaces cannot apply; agents without `flow:install` cannot apply live mounts.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/spaces/{id}/flows/live` | `space:read` | Live mounts in the space |
| `POST` | `/v1/spaces/{id}/flows/{install}/apply` | `flow:install` | Mount flow routes + refresh MCP catalog |
| `POST` | `/v1/spaces/{id}/flows/{install}/unmount` | `flow:install` | Remove live mount |

### MCP bridge (`/v1/mcp/*`)

Used by the hub daemon MCP integration (and `@murrmure/cli` when pointed at a self-hosted hub). Pass `space_id` as a query param or in the JSON body.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/mcp/catalog?space_id=` | token scopes + `flow_acl` | Grant-filtered tool list |
| `POST` | `/v1/mcp/session/handshake` | valid token | Control-bus ack + replay from `last_ack_seq` |
| `POST` | `/v1/mcp/tools/call?space_id=` | per-tool scope + ACL | Invoke a tool by name |

::: warning Retired
`POST /v1/mcp/wake` returns **404** (phase 16). Downstream work uses event reactions (`on: event:` in `.mrmr/space/handlers.yaml`), **`murrmure_emit_event`** (`event:emit` capability), flow triggers, and indexed hooks/triggers — not `murrmure_invoke_action` (removed, Task 15 Lane A).
:::


Grant **`flow_acl`** (e.g. `["review-loop", "feature-spec"]`) limits which installed flow tools appear in the catalog, even when scopes would otherwise allow them.

## Review API (`/api/sessions/*`)

Requires **review-loop** flow installed and applied live in the space.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Create session |
| `GET` | `/api/sessions` | List summaries |
| `GET` | `/api/sessions/{key}` | Session JSON |
| `POST` | `/api/sessions/{key}/comments` | Add comment |
| `POST` | `/api/sessions/{key}/finish` | Finish round |
| `POST` | `/api/sessions/{key}/review-cycle` | Long-poll |

Most integrators should use **MCP** instead of raw HTTP — see [MCP tools](./mcp-tools). Humans use [Murrmure Desktop](../guide/desktop).

## Feature-spec API (`/api/specs/*`)

Requires **feature-spec** flow installed, applied live, and a grant with `flow_acl` including `feature-spec`.

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

Shell UI: open checkpoint **views** in **ViewCanvasHost** at `/sessions/:sessionId` when a run pauses — not bare session metadata alone.

## Platform v2 — Sessions & runs

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `POST` | `/v1/sessions` | `flow:run` | Create session `{ title, subject?, space_id? }` |
| `GET` | `/v1/sessions` | `space:read` or `journal:read` | List sessions (`?status=`, `?space_id=`) |
| `GET` | `/v1/sessions/{id}` | `space:read` | Session detail + derived status |
| `GET` | `/v1/sessions/{id}/runs` | `space:read` | Runs in session |
| `POST` | `/v1/sessions/{id}/runs` | `flow:run` | Create run; optional `flow_id` must exist in the target space index, dispatches that flow, and pins its indexed `flow_digest` (caller-supplied digests are ignored) |
| `POST` | `/v1/sessions/{id}/cancel` | `flow:run` | Cancel all active runs in session |
| `POST` | `/v1/sessions/{id}/orchestration/attach` | `flow:run` | Agent-push `murrmure.flow.attach/v1`; creates orchestration gate |

MCP equivalents: `murrmure_create_session`, `murrmure_list_sessions`, `murrmure_get_session`, `murrmure_create_run`, `murrmure_get_run`, `murrmure_get_run_graph`, `murrmure_attach_orchestration`, `murrmure_cancel_run`.

## Platform v2 — Gates

Orchestration approval gates only — flow steps advance through `step:resolve`, not gates.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/runs/{id}/gates` | `space:read` | List orchestration gates for run (actor-presented) |
| `POST` | `/v1/runs/{id}/gates` | `flow:run` | Create pending orchestration gate on run |
| `POST` | `/v1/gates/{id}/resolve` | `flow:run` | Approve/reject `{ decision, resume_data?, form_values? }` |
| `GET` | `/v1/gates/wait` | `space:read` | Long-poll `?run_id=` or `?session_id=` (`timeout_ms` max 120s) |

Gate resolve is space-bound: a `flow:run` token may only resolve a gate in its own space; bootstrap and `hub:admin` tokens may resolve cross-space. Flow step completion uses **`POST /v1/runs/{id}/steps/{step_id}/resolve`** — not gate routes.

## Platform v2 — Notifications & profile

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/notifications` | valid token | Inbox (`?status=pending\|dismissed\|resolved`) |
| `POST` | `/v1/notifications/{id}/dismiss` | valid token | Dismiss notification |
| `GET` | `/v1/me` | valid token | User profile (landing space, notify prefs) |
| `PATCH` | `/v1/me` | valid token | `{ landing_space_id?, notify_email?, notify_desktop? }` |
| `POST` | `/v1/notifications/test` | `hub:admin` | Send test out-of-shell notification |

CLI: `mrmr me set-landing --space spc_…`. Desktop subscribes to SSE `out_of_shell.desktop` for native OS notifications — see [Murrmure Desktop](../guide/desktop).

## Platform v2 — Journal & SSE

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/journal` | `journal:read` | Query entries (`subject`, `type`, `session`, `space_id`, `since`, `until`, `limit`) |
| `POST` | `/v1/auth/sse-ticket` | `space:read` or `journal:read` | Mint 60s SSE ticket |
| `GET` | `/v1/journal/subscribe?ticket=` | ticket or bearer | Journal SSE stream |

MCP: `murrmure_journal_query`, `murrmure_wait_for_run`.

SSE events include: `journal.append`, `gate.pending`, `gate.resolved`, `notification.changed`, `out_of_shell.desktop`, `mrmr.space.index.updated`. See [@murrmure/shell-client](./shell-client).

## Space index {#space-index}

Indexed from local `.mrmr/` via apply. See [Space index guide](../guide/space-index).

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `POST` | `/v1/spaces/{id}/link` | `space:write` | Local binding `{ host, path, primary }` |
| `POST` | `/v1/spaces/{id}/link/remote` | `space:write` | Remote hub binding `{ peer_hub_id, remote_space_id }` |
| `POST` | `/v1/spaces/{id}/apply` | `space:write` | Index apply bundle (flows, handlers, views) |
| `GET` | `/v1/spaces/{id}/index/status` | `space:read` | Digests, counts, bindings, handler coverage |
| `GET` | `/v1/spaces/{id}/index/flows` | `space:read` | Indexed flow entries |
| `GET` | `/v1/flows/{flow_id}` | `space:read` | Single flow index entry |
| `GET` | `/v1/spaces/{id}/actions` | `space:read` | Indexed actions |
| `GET` | `/v1/spaces/{id}/executors` | `space:read` | Indexed executors |
| `GET` | `/v1/spaces/{id}/hooks` | `space:read` | Indexed hooks |

::: warning Retired
`POST /v1/spaces/{id}/actions/{name}/invoke` and the `murrmure_invoke_action` MCP tool return **404 / not-registered** (Task 15 Lane A). Action execution is internal flow/hook/scheduler dispatch only; the sole remaining invoke wire is the peer-only federation relay `POST /v1/federation/relay/spaces/:id/actions/:name/invoke` (`flow:run`-gated).
:::

MCP: `murrmure_apply_space`, `murrmure_space_status`.

## Flow starts & space home

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `POST` | `/v1/flows/{flow_id}/run` | `flow:run` | Manual start `{ space_id, input?, session_id?, idempotency_key? }` |
| `GET` | `/v1/spaces/{id}/home` | `space:read` | Space home (startable flows, recent sessions) |
| `GET` | `/v1/spaces/{id}/flows/{flow_id}/preview` | `flow:read` | Sanitized flow preview for UI |

CLI: `mrmr flow run <flow_id>`. Custom start UI: [View SDK](./view-sdk).

## Artifacts

Cross-space blob transfer (not MCP `blob_read`/`blob_write` — those were never shipped).

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `PUT` | `/v1/artifacts` | `blob:write` | Upload artifact `{ space_id, … }` |
| `GET` | `/v1/artifacts/{transfer_id}?space_id=` | `blob:read` | Fetch artifact metadata/payload |
| `POST` | `/v1/artifacts/{transfer_id}/materialize` | `blob:read` | Materialize into target space |

## Executor queue poll {#executor-queue-poll}

External workers poll for `queue_poll` executor tasks.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/executor/tasks?executor_id=` | `executor:poll` | Long-poll task offers (`timeout_ms` default 30s) |
| `GET` | `/v1/executor/poll-status` | `space:read` | Executor reachability snapshot |
| `POST` | `/v1/executor/tasks/{id}/complete` | `executor:poll` | Complete task `{ result }` |
| `POST` | `/v1/executor/tasks/{id}/fail` | `executor:poll` | Fail task `{ error_code, detail? }` |

CLI: `mrmr worker poll --executor <id>`.

## Federation

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/ops/federation/status` | `space:admin` | Relay status |
| `GET` | `/v1/ops/federation/peers` | `space:admin` | List peers |
| `POST` | `/v1/ops/federation/peers` | `space:admin` | Register peer `{ hub_id, url, auth_token? }` |
| `POST` | `/v1/federation/ingress` | `space:admin` | Ingest federated journal event |
| `POST` | `/v1/spaces/{id}/link/remote` | `space:write` | Virtual remote space binding |

CLI: `mrmr federation peer add --id hub_b --url http://…`, `mrmr federation status`.

## Views {#views}

Static assets for space-owned custom checkpoint views (`.mrmr/views/{view_id}/dist/`). Production Views are locally built and shell-hosted; the route serves them from the linked space root.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/spaces/{id}/views/{view_id}/*` | `space:read` | Serve view bundle file (requires linked space root) |

See [View SDK](./view-sdk).

## Errors

| HTTP | Code | Meaning |
|------|------|---------|
| 403 | `TOKEN_DENIED` | Bad or revoked token |
| 403 | `SCOPE_ENFORCEMENT_FAILURE` | Token not valid for this space or missing scope |
| 403 | `INSTALL_POLICY_VIOLATION` | Agent install blocked by space policy |
| 403 | `TOOL_NOT_AUTHORIZED` | MCP tool missing scope or not in grant `flow_acl` |
| 403 | `TRANSITION_GUARD_FAILED` | Flow guard (e.g. `publish_direct` when `skip_review: false`) |
| 403 | `QUERY_POLICY_DENIED` | Cross-space ask blocked by target `inbound_allowlist` |
| 403 | `LIVE_APPLY_FAILED` | Live mount could not be applied |
| 409 | — | Revision conflict; retry with current revision |
