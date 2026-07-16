# Studio triggers & hooks

Event-driven trigger registration, templates, and reactions **without a human prompt**. Builds on [config/spec.md](../config/spec.md) trigger form and hub async dispatcher.

**Normative path (post-cutover):** Space reactions live in `.mrmr/space/handlers.yaml` alongside step lifecycle handlers, declared with `on: event: { type, source? }` and empty or auxiliary `contract_keys`. Indexed on `mrmr space apply`. Implementation: `studio-hub-core/src/hooks/` — matcher + dispatch with mandatory Session + Run + `mrmr.hook.delivered`. See [bridges/triggers.md](../bridges/triggers.md) and [bridges/handlers.md](../bridges/handlers.md).

```yaml
# .mrmr/space/handlers.yaml
version: 1
handlers:
  - id: on-spec-published
    contract_keys: []
    on:
      event:
        type: mrmr.spec.published
        source: "/spaces/spc_backend"
    type: shell_spawn
    complete: auto
    command: mrmr flow run cross-review --input '{"ref": "{{event.data.artifact_ref}}"}'
```

**Emission & downstream:** agents with the `event:emit` capability call **`murrmure_emit_event`**; emittable types are gated at apply time by `.mrmr/space/events.yaml`. Downstream work starts via **flow triggers** (`mrmr flow run`) or the event handlers above — the clean protocol. Public action-invoke wires are removed (Task 15 Lane A).

**Legacy trigger templates:** retired. Historical removal records live in [../../archives/triggers-legacy-wake-wire.md](../../archives/triggers-legacy-wake-wire.md). New spaces declare `on: event:` handlers only; legacy hook indexes (alias: `triggers.yaml`) no longer index.

**Hook delivery invariant:** every delivery → Session + Run + journal `mrmr.hook.delivered`. Headless step id: `hook:{hook_id}`.

**Dedup chain (§4.5):** `dedup_key = hash(source, event.id, hook_id)` propagates to run `exec_context.idempotency_key`. Redelivered events skip duplicate runs.

**Prerequisites:** config CS2, feature-spec FS0, flow-runtime CR1.

## Problem

| Shipped CS2 | Gap |
|-------------|-----|
| Free-text event type filter | Admins pick wrong event name |
| Manual event reaction authoring | Error-prone |
| Agent must poll or wait for human | spec.published should auto-start dev agent |

## Scope

### In

- Event catalog — union of `events.declarations` from live capability contracts
- Event-handler reactions in `.mrmr/space/handlers.yaml` (`on: event:`)
- Delivery deep link — log row → spec instance / review session
- Dedup presets per template

### Out

- Cron scheduler UI
- Citizen integrator marketplace
- Parallel fan-out override (hub default sequential per partition)
- Retired wake-wire trigger actions (see archive)

## Dedup block (canonical)

```typescript
interface TriggerDedup {
  key_jsonpaths: string[];      // business keys, e.g. ["$.payload.spec_key", "$.payload.version"]
  window_seconds: number;       // TTL window (86400 default)
}
```

**Dedup drop reason (canonical enum):** `duplicate_business_key` | `duplicate_event_id` | `disabled` | `policy_denied`

**Registration:** required scope `trigger:register`. The clean protocol gates emittable event types in `.mrmr/space/events.yaml` at apply time. Retired trigger-action types are rejected with `422 TRIGGER_ACTION_RETIRED`.

## Delivery failure (hub ADR-14)

Handler delivery (`on: event:`) fails → `integration_failure` event + delivery log `outcome: failed` unless the handler opts out.

## HTTP routes

| Method | Path | Handler |
|--------|------|---------|
| GET | `/v1/spaces/{id}/triggers/event-catalog` | Rebuild from MountRegistry + contract loader |
| GET | `/v1/spaces/{id}/triggers/templates` | Historical retired presets (list only) |
| POST | `/v1/spaces/{id}/triggers/from-template` | Expand → `trigger.register` (retired presets rejected) |
| POST | `/v1/spaces/{id}/triggers/{id}/test-fire` | `trigger.replay` last matching or synthetic |

Config trigger CRUD routes unchanged — see [config/spec.md](../config/spec.md).

## Event catalog API

### GET `/v1/spaces/{id}/triggers/event-catalog`

```json
{
  "events": [
    {
      "type": "spec.published",
      "package_id": "feature-spec",
      "contract_version": "1.0.0",
      "payload_schema_summary": { "required": ["spec_key", "title"] }
    },
    {
      "type": "work.ready",
      "package_id": null,
      "source": "custom"
    }
  ]
}
```

Rebuilt on `capability.live_applied`.

## Trigger builder UI

| Step | UI |
|------|----|
| 1 | Pick event handler pattern |
| 2 | Select source space + event from catalog |
| 3 | Target handler (`on: event:`) + flow start |
| 4 | Dedup preset (editable) |
| 5 | Test fire (replay last matching event) |

Components: `TriggerTemplatePicker`, `EventCatalogSelect`, `TriggerTestFireButton`.

## Acceptance — TR-min

Post-cutover, trigger acceptance is the clean protocol: an `on: event:` handler in `.mrmr/space/handlers.yaml` reacts to an emitted event and starts downstream work via a flow trigger (`mrmr flow run`).

1. Apply a space with an `on: event:` handler bound to `spec.published` (emittable via `.mrmr/space/events.yaml`)
2. Emit `spec.published` via `murrmure_emit_event` → exactly one handler delivery (Session + Run + journal `mrmr.handler.delivered`)
3. Duplicate emit same business key **and version** within the dedup window → dedup drop in delivery log (`duplicate_business_key`)

## Acceptance — TR-full

4. Event catalog lists `spec.published` after feature-spec live apply
5. Test fire replays the handler without re-emitting the source event
6. Handler delivery fails → `integration_failure` event + delivery log `outcome: failed`
