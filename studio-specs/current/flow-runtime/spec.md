# Murrmure flow runtime

Dynamic flow push, grant-scoped MCP catalog, and control bus. Extends [product/spec.md](../product/spec.md) and [config/spec.md](../config/spec.md) without replacing hub evolution semantics.

## Problem

| Shipped (phase 1) | Target |
|-------------------|--------|
| Bundled catalog + manual daemon mount | `evolution.live.apply` refreshes routes + MCP without restart |
| MCP tools compiled at build time | Tool list = f(installed flows, grant, harness) |
| `contract_versions` on reconnect only | Control bus pushes `contract_updated` + `tools_changed` |
| Agent restart for new tools | Connected MCP receives tool delta within outbox TTL |
| Agent apply on `human_only` prod gap | Live apply re-checks `install_policy` |

## Scope

### In

- Mount registry — versioned active flow mounts per space
- Live apply hook — post-promote: policy check, register routes, refresh MCP, journal + control events
- Grant-filtered catalog — MCP `tools/list` filtered by scopes + `flow_acl` + harness
- Control bus — durable outbox (24h TTL) keyed by stable principal
- Handshake v2 — `murrmure/session.handshake`; mandatory pull reconciliation
- Strict deserialize — per-flow Zod at MCP invoke
- Rollback — unmount tools, push `tools_removed`
- mcp_wake dispatch — wake_label routing, not catalog lookup

### Out

- Marketplace / remote registry
- Agent LLM loop in hub
- Hot reload UI bundle without page refresh
- Peer-mesh flow sync

## Mount registry

| Field | Meaning |
|-------|---------|
| `install_id` | Flow install row |
| `space_id` | Owning space |
| `flow_id` | e.g. `review-loop`, `feature-spec` |
| `semver` | Live version |
| `contract_ref_id` | Pinned contract digest |
| `routes_prefix` | e.g. `/api/sessions`, `/api/specs` |
| `mount_module` | ESM export resolving Hono sub-router |
| `mcp_tools` | Tool names in manifest |
| `applied_at` | Last live apply timestamp |

**Invariants:**

- At most one live install per `(space_id, flow_id)`
- Unique `(space_id, routes_prefix)` — no route shadowing
- Unique `(space_id, tool_name)` across live manifests — no MCP collision

## Live apply sequence

```
evolution.live.apply(install_id)
  → POLICY: human_only space + non-human actor → 403 INSTALL_POLICY_VIOLATION
  → POLICY: agent without flow:install → 403 SCOPE_ENFORCEMENT_FAILURE
  → ATOMIC:
       MountRegistry.upsert(mount)
       app.route(routes_prefix, handler)
       McpToolRegistry.rebuild(space_id)
       journal: flow.live_applied
       control bus: contract_updated + tools_changed per principal
```

Failed mount rolls back registry row; install stays `promoted` not `live`.

## HTTP routes

| Method | Path | Command |
|--------|------|---------|
| GET | `/v1/spaces/{id}/flows/live` | `flow.list` filter live |
| POST | `/v1/spaces/{id}/flows/{install_id}/apply` | `evolution.live.apply` |
| POST | `/v1/flows/{id}/run` | Manual flow start (v2 index) |
| GET | `/v1/spaces/{id}/home` | Space home sections |
| GET | `/v1/mcp/catalog` | `mcp.catalog.for_token` |

### v2 flow index (space directory)

Flows in `.mrmr/flows/` are indexed via `POST /v1/spaces/{id}/apply`. The hub compiles manifest → IR, stores digest, and pins `flow_digest` on each Run. See [bridges/flow-engine.md](../bridges/flow-engine.md).

Apply errors: `INSTALL_POLICY_VIOLATION`, `SCOPE_ENFORCEMENT_FAILURE`, `LIVE_APPLY_FAILED`.

Static UI: `GET /flows/{flow_id}/{ver}/ui/*`.

Desktop single-URL mode is transport-only: shell (`/`), static flow UI (`/flows/.../ui/*`), and worker proxy routes (`/api/...`) share one origin, but flow install/apply/runtime semantics remain unchanged.

## Error envelope (apply + invoke)

All denials return structured JSON — never raw status alone (c01-J03, c01-J16):

```json
{
  "code": "INSTALL_POLICY_VIOLATION",
  "message": "Human-only install policy on this space",
  "hint": {
    "space_id": "spc_ui_prod",
    "suggested_space_id": "spc_ui_sandbox",
    "missing_scope": null
  }
}
```

| Code | When | hint fields |
|------|------|-------------|
| `INSTALL_POLICY_VIOLATION` | non-human on `human_only` | `space_id`, `suggested_space_id?` |
| `SCOPE_ENFORCEMENT_FAILURE` | missing scope | `missing_scope`, `space_id` |
| `TOOL_NOT_AUTHORIZED` | invoke not in catalog | `required_scope?`, `required_flow?` |
| `LIVE_APPLY_FAILED` | mount error | `install_id`, `rollback: true` |

Denied invokes append journal row for observability (c02-J17 quarterly review).

## Grant / harness catalog refresh

On `grant.revoke`, `grant.rotate`, or ACL patch: `McpToolRegistry.rebuild(space_id)` + push `tools_changed` to affected principals — same as live apply (c02-J17 scope drift).

## MCP catalog rules

```
visible = platform_tools(T.scopes)
        ∪ flow_tools(installed_live(S), T.flow_acl)
        filtered_by harness_binding(T.harness, tool.harness_allow?)
```

| Grant scope | Platform tools |
|-------------|----------------|
| `space:read` | `get_space_state`, `contract_versions` |
| `state:transition` | + `transition`, `wait_for_state` |
| `event:emit` | + `emit_event` |
| `query:ask` | + `query_ask` (cross-space) |
| `query:answer` | + `query_answer` |
| `flow:install` | + `flow_validate` (config) |

Domain tools: only if flow installed AND in manifest AND ACL allows flow.

Cross-surface enforcement: identical filter on `tools/list`, `tools/call`, `/v1/mcp/catalog`, flow HTTP routes.

## Control bus

**Principal key:** `ControlPrincipal = { space_id, token_id, client_id }` — not transient session_id. TTL 24h. Monotonic `seq` per message.

| Type | Payload |
|------|---------|
| `control.contract_updated` | `{ seq, space_id, flow_id, from_version, to_version, contract_ref_id }` |
| `control.tools_changed` | `{ seq, space_id, added, removed, unchanged }` |
| `control.handshake_ack` | `{ seq, server_contract_versions[], server_tools[] }` |
| `control.wake_pending` | `{ seq, wake_label, payload }` |

Client on `tools_changed` refreshes cache. Handshake sends `last_ack_seq`; server drains from `last_ack_seq + 1`.

## Handshake v2 (MCP connect)

1. Client → `murrmure/session.handshake` `{ protocol_version: 1, contract_versions[], known_tools[], client_id, last_ack_seq? }`
2. Server → mandatory `control.handshake_ack` with full `server_tools[]`
3. Server drains outbox from `last_ack_seq + 1`
4. If client behind live semver → immediate `contract_updated` + `tools_changed`

### tools/list behavior

**After CR1:** dynamic `McpToolRegistry.list(ctx: TokenContext)` — identical filter on `/v1/mcp/catalog`.

Pre-invoke on `tools/call`: verify tool ∈ catalog; strict Zod per flow leaf.

## mcp_wake semantics

**wake_label is routing metadata — NOT McpToolRegistry lookup.**

```typescript
await mcpWake({
  target_space_id,
  wake_label: "handle_spec_published",
  payload,
  session_hint: "wake",
});
```

Delivery succeeds when target space has connected MCP session with `space:enter` or higher. If no session: enqueue on space-keyed pending wake queue; deliver on first connect; journal `mcp.wake_pending` (24h TTL purge).

IDE harness decides auto-run, notification, or invoke granted tools.

## Journal events (new)

| type | When |
|------|------|
| `flow.live_applied` | Mount success |
| `flow.live_apply_failed` | Mount error |
| `flow.unmounted` | Rollback/supersede |
| `mcp.tools_changed` | Audit mirror |
| `mcp.wake_delivered` | Wake payload delivered |

## Deserialize compatibility

- Minor/patch: strip unknown input fields
- Major incompatible: strict reject with typed error

## Daemon internals

```typescript
interface MountRegistry {
  apply(mount: FlowMount): Promise<void>;
  unmount(spaceId: string, flowId: string): Promise<void>;
  getRoutes(spaceId: string): RouteEntry[];
}
interface McpToolRegistry {
  rebuild(spaceId: string): Promise<void>;
  listForToken(ctx: TokenContext): ToolDef[];
}
interface ControlBus {
  publish(principal: ControlPrincipal, msg: ControlMessage): void;
  drain(principal: ControlPrincipal, afterSeq?: number): ControlMessage[];
}
```

## Acceptance — CR-min

Fixtures: [../fixtures/flow-runtime/](../fixtures/flow-runtime/)

1. Promote feature-spec 1.0.0 → 1.1.0; connected MCP receives `tools_changed`
2. Worker grant without feature-spec in ACL → tools excluded
3. Rollback live → removed tools not invokable
4. Agent on `human_only` space apply → 403 INSTALL_POLICY_VIOLATION
5. Reconnect same `client_id` → missed control messages replayed by seq

## Acceptance — CR-full

6. Invoke after promote uses new Zod; old optional field accepted on minor bump
7. Two spaces same flow different versions — tools scoped per space
8. Harness binding enforced (`cloud-worker` vs `cursor-local`)
9. `/v1/mcp/catalog` matches stdio `tools/list`
10. mcp_wake with label `handle_spec_published` succeeds without catalog tool
