# Triggers — wire bridge

Maps [spec.md](../triggers/spec.md) to hub + shell.

## Canonical action shape

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

## HTTP additions

| Method | Path | Handler |
|--------|------|---------|
| GET | `/v1/spaces/{id}/triggers/event-catalog` | Rebuild from MountRegistry + contract loader |
| GET | `/v1/spaces/{id}/triggers/templates` | Static template defs |
| POST | `/v1/spaces/{id}/triggers/from-template` | Expand → `trigger.register` |
| POST | `/v1/spaces/{id}/triggers/{id}/test-fire` | `trigger.replay` last matching or synthetic |

Requires scope `trigger:register`. Wake labels must be on space allow-list.

## mcp_wake dispatch

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

## Shell components

```
apps/shell-web/src/configure/triggers/
  TriggerTemplatePicker.tsx
  EventCatalogSelect.tsx
  TriggerTestFireButton.tsx
```

## Package

```
packages/triggers-templates/
```
