# Flow runtime — wire bridge

Maps [spec.md](../flow-runtime/spec.md) to daemon packages. Phase 1 product bridge unchanged — these are **additions**.

MCP transport assumption: local tools use the Desktop-bundled
`murrmure-mcp` bridge (`@murrmure/mcp-bridge`) through its stable launcher,
with `--hub` and `--connection` ID arguments. The bridge reads the credential
from the OS store. Desktop publishes the launcher command, bundled entry, and
runtime in shared discovery. Explicit headless CI may inject
`MURRMURE_HUB_TOKEN` at process runtime.

## HTTP additions

| Method | Path | Command | Notes |
|--------|------|---------|-------|
| GET | `/v1/spaces/{id}/flows/live` | `flow.list` filter live | Mount registry view |
| POST | `/v1/spaces/{id}/flows/{install_id}/apply` | `evolution.live.apply` | Policy check then mount refresh |
| GET | `/v1/mcp/catalog` | `mcp.catalog.for_token` | Same ACL/harness filter as stdio |

Auth: Bearer on all; path `space_id` matches token.

### Apply errors

| Code | When |
|------|------|
| `INSTALL_POLICY_VIOLATION` | Non-human actor on `human_only` space |
| `SCOPE_ENFORCEMENT_FAILURE` | Agent without `flow:install` |
| `LIVE_APPLY_FAILED` | Mount/registry error — full compensate |

## MCP stdio — handshake v2

Client → server (first message after connect):

```json
{
  "method": "murrmure/session.handshake",
  "params": {
    "protocol_version": 1,
    "client_id": "cursor-local-uuid",
    "last_ack_seq": 42,
    "contract_versions": [
      { "flow_id": "review-loop", "version": "2.0.0", "contract_ref_id": "cref_…" }
    ],
    "known_tools": ["murrmure_space_status", "murrmure_resolve_step", "murrmure_wait_for_run"]
  }
}
```

Server → notifications (monotonic `seq`):

```json
{ "method": "murrmure/control.handshake_ack", "params": { "seq": 43, "server_tools": ["…"] } }
{ "method": "murrmure/control.tools_changed", "params": { "seq": 44, "added": [], "removed": [], "unchanged": ["…"] } }
```

### tools/list (CR1+)

Dynamic `McpToolRegistry.list(ctx: TokenContext)` — identical filter on `/v1/mcp/catalog`.

### tools/call

Pre-invoke: verify tool ∈ catalog; strict Zod per flow leaf.

## Daemon internals

```typescript
interface ControlPrincipal {
  space_id: string;
  token_id: string;
  client_id: string;
}

interface MountRegistry {
  apply(mount: FlowMount): Promise<void>;
  unmount(spaceId: string, flowId: string): Promise<void>;
  getRoutes(spaceId: string): RouteEntry[];
}

interface McpToolRegistry {
  rebuild(spaceId: string): Promise<void>;
  listForToken(ctx: TokenContext): ToolDef[];
  getHandler(toolName: string): ToolHandler | undefined;
}

interface ControlBus {
  publish(principal: ControlPrincipal, msg: ControlMessage): void;
  drain(principal: ControlPrincipal, afterSeq?: number): ControlMessage[];
}

interface McpWakeDispatcher {
  // Wake wire (`POST /v1/mcp/wake`) is retired — 404 (phase 16). The clean
  // protocol uses event handlers + `murrmure_emit_event` + flow triggers
  // (see triggers/spec.md). This class now tracks connected MCP principals
  // per space for executor preflight only — it no longer dispatches wakes.
  connect(principal: ControlPrincipal): void;
  disconnect(principal: ControlPrincipal): void;
  hasConnectedSession(spaceId: string): boolean;
  connectedPrincipals(spaceId: string): ControlPrincipal[];
}
```

Hook `evolution.live.apply` in `packages/hub-daemon` after hub-core commit.

## Journal events (new)

| type | When |
|------|------|
| `flow.live_applied` | Mount success |
| `flow.live_apply_failed` | Mount error |
| `flow.unmounted` | Rollback/supersede |
| `mcp.tools_changed` | Audit mirror |

## SSE (optional)

`event: flow.live_applied` on space channel — configure UI refreshes installed list.

## Packages

| Package | Role |
|---------|------|
| `packages/hub-daemon/src/mount-registry.ts` | MountRegistry |
| `packages/hub-daemon/src/mcp-tool-registry.ts` | Catalog rebuild |
| `packages/hub-daemon/src/control-bus.ts` | Outbox + replay |
| `packages/hub-daemon/src/mcp-wake-dispatcher.ts` | Connected-session tracking (wake wire retired — 404) |
