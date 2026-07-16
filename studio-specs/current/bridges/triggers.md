# Triggers — wire bridge

Maps [spec.md](../triggers/spec.md) to hub + shell. **Event-driven handlers** live in `.mrmr/space/handlers.yaml` alongside step lifecycle handlers — see [handlers.md](./handlers.md).

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

**Dedup drop reason enum:** `duplicate_business_key` | `duplicate_event_id` | `disabled` | `policy_denied`

## HTTP additions

| Method | Path | Handler |
|--------|------|---------|
| GET | `/v1/spaces/{id}/triggers/event-catalog` | Rebuild from MountRegistry + contract loader |
| GET | `/v1/spaces/{id}/triggers/templates` | Historical retired presets (list only) |
| POST | `/v1/spaces/{id}/triggers/from-template` | Expand → `trigger.register` (retired presets rejected) |
| POST | `/v1/spaces/{id}/triggers/{id}/test-fire` | `trigger.replay` last matching or synthetic |

Requires scope `trigger:register`. Emittable event types are gated in `.mrmr/space/events.yaml` at apply time.

## Shell / trigger registration (v2)

Trigger registration is **CLI-first** (`mrmr space trigger *`) or via event handlers in `.mrmr/space/handlers.yaml` + `mrmr space apply`. The handlers-only cutover is complete (Task 15): legacy hook indexes no longer index — space reactions live only in `.mrmr/space/handlers.yaml`. Retired configure-shell trigger UI components were removed with the shell.

Legacy wake-wire trigger actions are archived in [../../archives/triggers-legacy-wake-wire.md](../../archives/triggers-legacy-wake-wire.md).

## Package

```
packages/triggers-templates/
```

## References

- [handlers.md](./handlers.md) — step + event handler schema
- [grants-migration.md](./grants-migration.md) — `event:emit` capability
