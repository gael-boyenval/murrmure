# Bridge — Headless action invoke

**Status:** Normative — **operator / headless path only**  
**Not for flow steps** — step-contract flows dispatch via [handlers.md](./handlers.md) on `step.opened`; agents complete steps with `murrmure_resolve_step` (`step:resolve`).

**HTTP:** `POST /v1/spaces/{space_id}/actions/{action_name}/invoke`  
**MCP:** `murrmure_invoke_action` (`action:invoke` capability)  
**v1 shim:** `POST /v1/mcp/wake` maps `wake_label` → action name

---

## When to use

| Path | Use case |
|------|----------|
| **Handler dispatch** | Flow step opens → engine matches `contract_keys` → shell/MCP handler runs |
| **Headless invoke** (this doc) | CLI scripts, operator tools, legacy `actions.yaml` entries, debug — **no active flow step** |

Headless invoke uses synthetic step id `action:{action_name}`.

---

## Flow

1. Resolve action binding from space index (`mrmr space apply`). Legacy spaces index `murrmure/actions.yaml`; new spaces prefer handlers only.
2. **Preflight** executor reachability (`ExecutorPort.preflight`).
3. On unreachable + default `fail_fast` → `EXECUTOR_UNAVAILABLE` (HTTP 503, journal `mrmr.action.executor_unavailable`).
4. On reachable → journal `mrmr.action.dispatched`, dispatch via adapter.
5. Sync executors (`shell_spawn`) → journal `mrmr.action.completed` in same request.
6. Async executors (`mcp_session`) → `dispatched`; completion via journal callback.

Headless invoke does **not** advance flow runs. For in-run work, use handler dispatch + `murrmure_resolve_step`.

## Idempotency

`Idempotency-Key` + `run_id` + `step_id` → memoized dispatch outcome (hub-core).

## Executors

| Type | Adapter | Reachability |
|------|---------|--------------|
| `shell_spawn` | `packages/executors/shell-spawn` | Linked space root path |
| `mcp_session` | `packages/executors/mcp-session` | MCP handshake connected |

### `shell_spawn` child environment

Injected on every dispatch (`packages/executors/src/shell-spawn.ts`):

| Variable | Status | Content |
|----------|--------|---------|
| `MURRMURE_ACTION` | ✅ | Action name |
| `MURRMURE_SPACE_ID` | ✅ | Space id |
| `MURRMURE_RUN_ID` | ✅ | Run id |
| `MURRMURE_SESSION_ID` | ✅ | Session id |
| `MURRMURE_STEP_ID` | ✅ | Step id |
| `MURRMURE_INVOKE_PARAMS` | ✅ | JSON resolved invoke params |
| `MURRMURE_PROMPT` | ✅ | Resolved prompt template |
| `MURRMURE_INPUT` | ✅ | JSON `exec_context.input` from the run |

Handler dispatch injects additional run-scoped tokens (`MURRMURE_HUB_TOKEN`, `MURRMURE_HUB_URL`) — see [handlers.md](./handlers.md) § Q6.

Scripts should prefer these env vars over hub API scraping. See [environment.md](../../../apps/docs/reference/environment.md).

### MCP agent environment (bridge process)

MCP agents connect through `murrmure-mcp` (`@murrmure/mcp-bridge`) with thin config:

| Field / variable | Required | Notes |
|------------------|----------|-------|
| `command` | ✅ | Bundled absolute path when Desktop runs (from `shared.json` → `mcp_bridge.command`); else `"murrmure-mcp"` on PATH |
| `MURRMURE_HUB_TOKEN` | ✅ | Required bearer token for MCP catalog/call |
| `MURRMURE_SPACE_ID` | ❌ | Not required; token claims define space identity |

MCP config keeps `command` + `MURRMURE_HUB_TOKEN` only — no hub URL or space pinning in MCP env.

## Migration from mcp_wake

- `wake_label` → `action_name`
- `payload` → `params`
- No silent `mcp.wake_pending` unless action/invoke sets `delivery: queue_until_executor`

See [triggers/spec.md](../triggers/spec.md) for trigger template updates.

## References

- [handlers.md](./handlers.md) — primary execution path for flow steps
- [step-contract.md](./step-contract.md) — protocol-only manifests + resolve API
