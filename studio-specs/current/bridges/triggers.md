# Triggers — wire bridge

Maps [spec.md](../triggers/spec.md) to hub + shell. **Event-driven handlers** live in `.mrmr/space/handlers.yaml` alongside step lifecycle handlers — see [handlers.md](./handlers.md).

## Canonical action shape (legacy trigger templates)

```typescript
interface McpWakeAction {
  type: "mcp_wake";
  target_space_id: string;
  wake_label: string;
  payload_map: Record<string, string>;
  session_hint?: "wake";
}

interface TriggerDedup {
  key_jsonpaths: string[];
  window_seconds: number;
}
```

**Legacy normalize on register:** `wake_mcp_agent` + `tool` → `mcp_wake` + `wake_label`.

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

Requires scope `trigger:register`. Wake labels must be on space allow-list.

## mcp_wake dispatch (legacy)

```typescript
const payload = applyJsonPathMap(sourceEvent.payload, action.payload_map);
await mcpWake({
  target_space_id,
  wake_label: action.wake_label,
  payload,
  session_hint: "wake",
});
```

On failure: `integration_failure` event + delivery log `outcome: failed`.

If no connected session: enqueue + `control.wake_pending`.

Prefer handler `on: event:` over `mcp_wake` trigger actions for new spaces.

## Shell / trigger registration (v2)

Trigger registration is **CLI-first** (`mrmr space trigger *`) or via event handlers in `.mrmr/space/handlers.yaml` + `mrmr space apply`. Legacy `murrmure/hooks.yaml` still indexes for unmigrated spaces. Configure trigger UI components were retired with Configure shell.

## Package

```
packages/triggers-templates/
```

## References

- [handlers.md](./handlers.md) — step + event handler schema
- [grants-migration.md](./grants-migration.md) — `event:emit` capability
