# Flow runtime — wire bridge

Maps [spec.md](../flow-runtime/spec.md) to daemon packages. Phase 1 product bridge unchanged — these are **additions**.

MCP transport assumption: local tools use the Desktop-bundled
`murrmure-mcp` bridge (`@murrmure/mcp-bridge`) through its stable launcher.
Client config pins `--connection <con_…>`; the bridge resolves the Hub endpoint
from Desktop discovery and the credential from the OS store for that connection.
Desktop publishes the launcher command, bundled entry, and runtime in shared
discovery.
Explicit headless CI may inject a hub bearer token at process runtime.

## HTTP additions

| Method | Path | Command | Notes |
|--------|------|---------|-------|
| GET | `/v1/spaces/{id}/flows/live` | `flow.list` filter live | Mount registry view |
| POST | `/v1/spaces/{id}/flows/{install_id}/apply` | `evolution.live.apply` | Policy check then mount refresh |
| GET | `/v1/mcp/catalog` | `mcp.catalog.for_token` | Same ACL/harness filter as stdio |

Auth: Bearer on all; path `space_id` matches token.

## Platform flows

Hub-owned orchestration compiled at boot — not authored under `.mrmr/flows/`, not seeded into empty spaces (ADR-006).

| `flow_id` | Name | Indexed when |
|-----------|------|----------------|
| `flw_mrmr_directive` | `directive` | Space binds `step.opened::directive.execute` |

`getFlowIndexEntry('flw_mrmr_directive', spaceId)` succeeds only for opted-in spaces. Origin on the entry is `spc_mrmr_platform` so space-home `can_run` stays false. Discovery: `GET /v1/directives/eligible` (`space:read`; bootstrap / `hub:admin` sees all). MCP: `murrmure_list_directive_eligible` and `murrmure_start_directive` require `hub:admin` (default `local-tools/v1` does not see them). Run detail includes `result: { step_id, status?, message? }` from the resolved step.

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
The stdio bridge refetches that catalog on every `tools/list`. After a hub
restart, handshake treats a client `last_ack_seq` ahead of the new seq as 0.
The bridge also compares `server_tools` and discovery `pid`/`started_at` so
Cursor gets `tools/list_changed`.

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

interface McpSessionRegistry {
  // The retired wake HTTP endpoint is gone — 404 (phase 16). The clean
  // protocol uses event handlers + `murrmure_emit_event` + flow triggers
  // (see triggers/spec.md). This registry tracks connected MCP principals
  // per space for the live `mcp_session` executor + handshake — it does not
  // dispatch legacy wake calls (the retired wake dispatcher was renamed to clarify
  // this; legacy wake runtime calls are not a runtime primitive).
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

`event: flow.live_applied` on space channel — retired configure shell would have refreshed installed list (removed).

## Packages

| Package | Role |
|---------|------|
| `packages/hub-daemon/src/mount-registry.ts` | MountRegistry |
| `packages/hub-daemon/src/mcp-tool-registry.ts` | Catalog rebuild |
| `packages/hub-daemon/src/control-bus.ts` | Outbox + replay |
| `packages/hub-daemon/src/mcp-session-registry.ts` | Connected-session tracking (wake wire retired — 404; renamed from `mcp-wake-dispatcher.ts`) |
