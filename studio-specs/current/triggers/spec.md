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

**Legacy trigger templates (`mcp_wake`):** retained as historical/legacy trigger-action presets only. The `POST /v1/mcp/wake` wire is retired (**404**, phase 16) and the handlers-only cutover is complete (Task 15) — space reactions live only in `.mrmr/space/handlers.yaml` (`on: event:`); `murrmure/hooks.yaml` (alias: `triggers.yaml`) no longer indexes. New spaces declare `on: event:` handlers; there is no active `mcp_wake` trigger-action acceptance.

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

## Legacy trigger action schema (`mcp_wake` — retired)

> **Removed (Task 15 Lane C).** The `mcp_wake` trigger-action schema is a
> historical preset only — the `POST /v1/mcp/wake` wire is retired (**404**,
> phase 16) and `mcpWake(...)` is not a runtime primitive. New spaces use
> `on: event:` handlers + `murrmure_emit_event` — see [bridges/triggers.md](../bridges/triggers.md). The shape below is retained as a removal record.

Legacy trigger templates used **`action.type: "mcp_wake"`** (retired wire; new spaces use `on: event:` handlers):

```typescript
// Historical only — retired wire; do not implement. Clean protocol: event
// handlers + murrmure_emit_event.
interface McpWakeAction {
  type: "mcp_wake";
  target_space_id: string;
  wake_label: string;           // retired — routing metadata, not catalog tool name
  payload_map: Record<string, string>;  // JSONPath → payload field
  session_hint?: "wake";
}
```

**Legacy aliases (retired, normalize on register was removed):** `wake_mcp_agent`, `tool` → mapped to `mcp_wake` + `wake_label` — gone with the wire.

**Dedup block (canonical):**

```typescript
interface TriggerDedup {
  key_jsonpaths: string[];      // business keys, e.g. ["$.payload.spec_key", "$.payload.version"]
  window_seconds: number;       // TTL window (86400 default)
}
```

**Dedup drop reason (canonical enum):** `duplicate_business_key` | `duplicate_event_id` | `disabled` | `policy_denied`

**Registration (legacy):** required scope `trigger:register`; the retired `wake_label` allow-list no longer applies — the clean protocol gates emittable event types in `.mrmr/space/events.yaml` at apply time. Registration appends audit row.

## Template: `spec-published-wake-dev` (legacy — retired)

> **Removed (Task 15 Lane C).** This `mcp_wake` trigger template is a historical
> preset only — the wire is retired (**404**, phase 16) and the
> retired `wake_label` (`handle_spec_published`) routes nowhere. The clean protocol
> reacts to `spec.published` with an `on: event:` handler in
> `.mrmr/space/handlers.yaml` that runs `mrmr flow run`. Kept as a removal record.

**When (historical):** `spec.published` in source space (Specs).
**Action (historical):** retired `mcp_wake` trigger action targeting `spc_dev_code` with the retired `wake_label` `handle_spec_published`.

**Do not include `body_ref` in wake payload** — cross-space minimum disclosure (c02-J14). Woken agent fetches detail via `query_ask` / `spec_summary@1` on source space.

**Dedup default:** `{ "key_jsonpaths": ["$.payload.spec_key", "$.payload.version"], "window_seconds": 86400 }`

Republish same version → dedup drop. Republish v2 → new delivery.

**Partition:** `space_id:instance_id` from source event.

## Template: `work-ready-wake-frontend` (legacy — retired)

> **Removed (Task 15 Lane C).** This `mcp_wake` trigger template is a historical
> preset only — the wire is retired (**404**, phase 16) and the
> retired `wake_label` (`handle_work_ready`) routes nowhere. The clean protocol reacts
> to `work.ready` with an `on: event:` handler that runs `mrmr flow run`. Kept
> as a removal record.

**When (historical):** `work.ready` in `backend-api`, filter `payload.type == "api_change"`.
**Action (historical):** retired `mcp_wake` trigger action targeting `spc_ui_sandbox` with the retired `wake_label` `handle_work_ready`.

**Dedup default:** `{ "key_jsonpaths": ["$.payload.openapi_diff_ref"], "window_seconds": 86400 }`

Agent uses `blob_read` or `query_ask` for diff ref — not inline megabyte payload (c01-J02).

## Delivery failure (hub ADR-14)

**Historical (retired `mcp_wake` wire):** when `mcp_wake` delivery failed (no session, harness mismatch, dispatch error) the hub appended an `integration_failure` event + delivery log row `outcome: failed` — platform default unless the trigger opted out. The wire is retired (404, phase 16); the clean protocol applies the same failure semantics to **handler delivery** (`on: event:` handlers) — see Acceptance TR-full step 6.

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

> **Retired wire:** `POST /v1/mcp/wake` returns **404** (phase 16). New spaces declare event reactions with `on: event:` in `.mrmr/space/handlers.yaml` and emit via `murrmure_emit_event` (`event:emit` capability); downstream work starts through flow triggers — **not** `murrmure_invoke_action` (removed, Task 15 Lane A). The legacy internal dispatch below is a historical removal record only — no `mcp_wake` trigger template dispatches (the wire is retired, 404).

```typescript
// Historical only — retired wire; no mcpWake(...) runtime primitive. Clean
// protocol: on: event: handlers + murrmure_emit_event (not mcpWake).
const payload = applyJsonPathMap(sourceEvent.payload, action.payload_map);
await mcpWake({ target_space_id, wake_label, payload, session_hint: "wake" }); // gone
```

**session_hint wake (v1, retired):** the retired `control.wake_pending` queue no longer exists — fail fast instead.
**Clean protocol:** handler dispatch (`on: event:`) fails fast on no MCP session / unreachable executor unless queue mode is opted in. The legacy `invoke preflight` (action-invoke spine) is removed/historical (Task 15).

## Trigger builder UI

| Step | UI |
|------|----|
| 1 | Pick template or custom |
| 2 | Select source space + event from catalog |
| 3 | Target space + handler (`on: event:`); legacy `wake_label` retired (Task 15) |
| 4 | Dedup preset (editable) |
| 5 | Test fire (replay last matching event) |

Components: `TriggerTemplatePicker`, `EventCatalogSelect`, `TriggerTestFireButton`.

## Acceptance — TR-min

Post-cutover, trigger acceptance is the clean protocol: an `on: event:` handler in `.mrmr/space/handlers.yaml` reacts to an emitted event and starts downstream work via a flow trigger (`mrmr flow run`). The legacy `mcp_wake` fixtures below are historical/removal records only — the wire is retired (404).

Historical fixture (retired wire): [../fixtures/triggers/spec-published-wake-dev.json](../fixtures/triggers/spec-published-wake-dev.json)

1. Apply a space with an `on: event:` handler bound to `spec.published` (emittable via `.mrmr/space/events.yaml`)
2. Emit `spec.published` via `murrmure_emit_event` → exactly one handler delivery (Session + Run + journal `mrmr.handler.delivered`)
3. Duplicate emit same business key **and version** within the dedup window → dedup drop in delivery log (`duplicate_business_key`)

## Acceptance — TR-full

Historical fixture (retired wire): [../fixtures/triggers/dedup-spec-publish.json](../fixtures/triggers/dedup-spec-publish.json)

4. Event catalog lists `spec.published` after feature-spec live apply
5. Test fire replays the handler without re-emitting the source event
6. Handler delivery fails → `integration_failure` event + delivery log `outcome: failed`
