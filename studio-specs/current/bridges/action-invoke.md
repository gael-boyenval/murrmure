# Action invoke bridge (v2)

**Status:** normative for Murrmure v2  
**HTTP:** `POST /v1/spaces/{space_id}/actions/{action_name}/invoke`  
**MCP:** `murrmure_invoke_action`  
**v1 shim:** `POST /v1/mcp/wake` maps `wake_label` → action name

---

## Flow

1. Resolve action + executor binding from space index (`mrmr space apply`).
2. **Preflight** executor reachability (`ExecutorPort.preflight`).
3. On unreachable + default `fail_fast` → `EXECUTOR_UNAVAILABLE` (HTTP 503, journal `mrmr.action.executor_unavailable`).
4. On reachable → journal `mrmr.action.dispatched`, dispatch via adapter.
5. Sync executors (`shell_spawn`) → journal `mrmr.action.completed` in same request.
6. Async executors (`mcp_session`) → `dispatched`; completion via journal callback.
7. On `mrmr.action.completed` inside a flow run → `exec_context.steps[step_id].output` updated (phase 03).

## Headless invoke

CLI / direct HTTP without a flow uses `step_id: action:{action_name}`.

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

Scripts should prefer these env vars over hub API scraping. See [environment.md](../../../apps/docs/reference/environment.md).

## Migration from mcp_wake

- `wake_label` → `action_name`
- `payload` → `params`
- No silent `mcp.wake_pending` unless action/invoke sets `delivery: queue_until_executor`

See [triggers/spec.md](../triggers/spec.md) for trigger template updates.
