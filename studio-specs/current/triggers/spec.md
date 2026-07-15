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

**Emission & downstream:** agents with the `event:emit` capability call **`murrmure_emit_event`**; emittable types are gated at apply time by `.mrmr/space/events.yaml`. Downstream work starts via **flow triggers** (`mrmr flow run`) or the event handlers above — the clean protocol. It does **not** use `murrmure_invoke_action` (removed, Task 15 Lane A) or the retired `mcp_wake` wire.

**Hook delivery invariant:** every delivery → Session + Run + journal `mrmr.hook.delivered`. Headless step id: `hook:{hook_id}`.

**Dedup chain (§4.5):** `dedup_key = hash(source, event.id, hook_id)` propagates to run `exec_context.idempotency_key`. Redelivered events skip duplicate runs.

**Legacy trigger templates (`mcp_wake`):** retained as historical/legacy trigger-action presets only. The `POST /v1/mcp/wake` wire is retired (**404**, phase 16); new spaces declare `on: event:` handlers instead. `murrmure/hooks.yaml` (alias: `triggers.yaml`) still indexes for unmigrated spaces. Prefer event handlers over `mcp_wake` trigger actions for new spaces.

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
- Legacy templates — parameterized `mcp_wake` trigger presets (retired wire)
- Template `spec-published-wake-dev` — canonical J02-style spec workflow (legacy)
- Delivery deep link — log row → spec instance / review session
- Dedup presets per template

### Out

- Cron scheduler UI
- Citizen integrator marketplace
- Parallel fan-out override (hub default sequential per partition)

## Legacy trigger action schema (`mcp_wake`)

Legacy trigger templates use **`action.type: "mcp_wake"`** (retired `POST /v1/mcp/wake` wire; new spaces use `on: event:` handlers — see [bridges/triggers.md](../bridges/triggers.md)):

```typescript
interface McpWakeAction {
  type: "mcp_wake";
  target_space_id: string;
  wake_label: string;           // canonical — routing metadata, not catalog tool name
  payload_map: Record<string, string>;  // JSONPath → payload field
  session_hint?: "wake";
}
```

**Legacy aliases (read only, normalize on register):** `wake_mcp_agent`, `tool` → map to `mcp_wake` + `wake_label`.

**Dedup block (canonical):**

```typescript
interface TriggerDedup {
  key_jsonpaths: string[];      // business keys, e.g. ["$.payload.spec_key", "$.payload.version"]
  window_seconds: number;       // TTL window (86400 default)
}
```

**Dedup drop reason (canonical enum):** `duplicate_business_key` | `duplicate_event_id` | `disabled` | `policy_denied`

**Registration:** requires scope `trigger:register`. Handler `wake_label` values must be on space **allow-list** (configurable per space; default: template presets only). Registration appends audit row.

## Template: `spec-published-wake-dev` (legacy)

**When:** `spec.published` in source space (Specs).

**Action:** `mcp_wake` (legacy trigger action)

```json
{
  "type": "mcp_wake",
  "target_space_id": "spc_dev_code",
  "wake_label": "handle_spec_published",
  "payload_map": {
    "spec_key": "$.payload.spec_key",
    "title": "$.payload.title",
    "version": "$.payload.version",
    "summary": "$.payload.summary",
    "source_space_id": "$.space_id"
  }
}
```

**Do not include `body_ref` in wake payload** — cross-space minimum disclosure (c02-J14). Woken agent fetches detail via `query_ask` / `spec_summary@1` on source space.

**Dedup default:** `{ "key_jsonpaths": ["$.payload.spec_key", "$.payload.version"], "window_seconds": 86400 }`

Republish same version → dedup drop. Republish v2 → new delivery.

**Partition:** `space_id:instance_id` from source event.

## Template: `work-ready-wake-frontend` (legacy)

**When:** `work.ready` in `backend-api`, filter `payload.type == "api_change"`.

```json
{
  "type": "mcp_wake",
  "target_space_id": "spc_ui_sandbox",
  "wake_label": "handle_work_ready",
  "payload_map": {
    "type": "$.payload.type",
    "summary": "$.payload.summary",
    "openapi_diff_ref": "$.payload.openapi_diff_ref"
  }
}
```

**Dedup default:** `{ "key_jsonpaths": ["$.payload.openapi_diff_ref"], "window_seconds": 86400 }`

Agent uses `blob_read` or `query_ask` for diff ref — not inline megabyte payload (c01-J02).

## Delivery failure (hub ADR-14)

When mcp_wake delivery fails (no session, harness mismatch, dispatch error): append `integration_failure` event + delivery log row `outcome: failed`. Not optional — platform default unless trigger opts out.

## HTTP routes

| Method | Path | Handler |
|--------|------|---------|
| GET | `/v1/spaces/{id}/triggers/event-catalog` | Rebuild from MountRegistry + contract loader |
| GET | `/v1/spaces/{id}/triggers/templates` | Static template defs |
| POST | `/v1/spaces/{id}/triggers/from-template` | Expand → `trigger.register` |
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

## mcp_wake dispatch (legacy, retired wire)

> **Retired wire:** `POST /v1/mcp/wake` returns **404** (phase 16). New spaces declare event reactions with `on: event:` in `.mrmr/space/handlers.yaml` and emit via `murrmure_emit_event` (`event:emit` capability); downstream work starts through flow triggers — **not** `murrmure_invoke_action` (removed, Task 15 Lane A). The legacy internal dispatch below applies only to unmigrated `mcp_wake` trigger templates.

```typescript
const payload = applyJsonPathMap(sourceEvent.payload, action.payload_map);
await mcpWake({ target_space_id, wake_label, payload, session_hint: "wake" });
```

**session_hint wake (v1):** prefer connected MCP session on target space; else enqueue + `control.wake_pending`.  
**v2 default:** invoke preflight — fail fast when no MCP session unless queue mode opted in.

## Trigger builder UI

| Step | UI |
|------|----|
| 1 | Pick template or custom |
| 2 | Select source space + event from catalog |
| 3 | Target space + wake label |
| 4 | Dedup preset (editable) |
| 5 | Test fire (replay last matching event) |

Components: `TriggerTemplatePicker`, `EventCatalogSelect`, `TriggerTestFireButton`.

## Acceptance — TR-min

Fixtures: [../fixtures/triggers/spec-published-wake-dev.json](../fixtures/triggers/spec-published-wake-dev.json)

1. Register spec-published-wake-dev via template
2. Publish spec → exactly one mcp_wake delivery
3. Duplicate publish same spec_key **and version** → dedup drop in delivery log (`duplicate_business_key`)

## Acceptance — TR-full

Fixtures: [../fixtures/triggers/dedup-spec-publish.json](../fixtures/triggers/dedup-spec-publish.json)

4. Event catalog lists spec.published after feature-spec live apply
5. Test fire replays without re-emitting source event
6. Wake fails → integration_failure event + delivery log failed
