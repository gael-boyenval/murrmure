# Triggers — wire bridge

Maps [spec.md](../triggers/spec.md) to hub + shell. **Event-driven handlers** live in `.mrmr/space/handlers.yaml` alongside step lifecycle handlers — see [handlers.md](./handlers.md).

## Canonical action shape (legacy trigger templates — retired)

> **Removed (Task 15 Lane C).** The `mcp_wake` / `wake_label` trigger-action
> shape is a historical preset only — the `POST /v1/mcp/wake` wire is retired
> (**404**, phase 16) and `mcpWake(...)` is not a runtime primitive. New spaces
> use **event handlers** (`.mrmr/space/handlers.yaml` `on: event: { type, source? }`)
> + **`murrmure_emit_event`** (`event:emit` capability) + flow start conditions
> — the clean protocol. The legacy shape is retained below as a removal record.

```typescript
// Historical only — retired wire; do not implement. Clean protocol: event
// handlers + murrmure_emit_event (see "Event handlers" below).
interface McpWakeAction {
  type: "mcp_wake";
  target_space_id: string;
  wake_label: string;                 // retired — routing metadata, not catalog tool name
  payload_map: Record<string, string>;
  session_hint?: "wake";
}

interface TriggerDedup {
  key_jsonpaths: string[];
  window_seconds: number;
}
```

**Legacy normalize on register (retired):** `wake_mcp_agent` + `tool` → `mcp_wake` + `wake_label` — gone with the wire.

**Dedup drop reason enum:** `duplicate_business_key` | `duplicate_event_id` | `disabled` | `policy_denied`

## Event handlers (post-cutover)

Declare event reactions in `handlers.yaml` with `on: event: { type, source? }` and empty or auxiliary `contract_keys`:

```yaml
handlers:
  - id: on-pr-merged
    contract_keys: []
    on:
      event:
        type: github.pull_request.merged
    type: shell_spawn
    complete: auto
    command: mrmr flow run preview-review --input '{"pr": "{{event.number}}"}'
```

Emission: agents with the `event:emit` capability call `murrmure_emit_event`. Declarations in `.mrmr/space/events.yaml` gate emittable types at apply time.

## HTTP additions

| Method | Path | Handler |
|--------|------|---------|
| GET | `/v1/spaces/{id}/triggers/event-catalog` | Rebuild from MountRegistry + contract loader |
| GET | `/v1/spaces/{id}/triggers/templates` | Static template defs |
| POST | `/v1/spaces/{id}/triggers/from-template` | Expand → `trigger.register` |
| POST | `/v1/spaces/{id}/triggers/{id}/test-fire` | `trigger.replay` last matching or synthetic |

Requires scope `trigger:register`. Retired `mcp_wake` wake labels were on a space allow-list; the clean protocol gates emittable event types in `.mrmr/space/events.yaml` at apply time instead.

## mcp_wake dispatch (legacy — retired wire)

> **Removed (Task 15 Lane C).** The `mcp_wake` dispatch flow is gone — the
> `POST /v1/mcp/wake` wire returns **404** (phase 16) and `mcpWake(...)` is not a
> runtime primitive. The retired `control.wake_pending` pending-wake queue is
> gone. The clean protocol uses event handlers + `murrmure_emit_event` + flow
> triggers. The historical dispatch below is a removal record only; it is not
> active and must not be reimplemented.

```typescript
// Historical only — retired wire; no mcpWake(...) runtime primitive. Clean
// protocol: on: event: handlers + murrmure_emit_event.
const payload = applyJsonPathMap(sourceEvent.payload, action.payload_map);
await mcpWake({ target_space_id, wake_label, payload, session_hint: "wake" }); // gone
```

On failure (historical): `integration_failure` event + delivery log `outcome: failed`.

No connected session (historical): the retired `control.wake_pending` queue no longer exists — fail fast instead.

Prefer handler `on: event:` over the retired `mcp_wake` trigger actions for new spaces.

## Shell / trigger registration (v2)

Trigger registration is **CLI-first** (`mrmr space trigger *`) or via event handlers in `.mrmr/space/handlers.yaml` + `mrmr space apply`. Legacy `murrmure/hooks.yaml` still indexes for unmigrated spaces. Configure trigger UI components were retired with Configure shell.

## Package

```
packages/triggers-templates/
```

## References

- [handlers.md](./handlers.md) — step + event handler schema
- [grants-migration.md](./grants-migration.md) — `event:emit` capability
