# Part 2 — Push flow and register trigger

This page wires Murrmure transport end-to-end:

`brief.requested` (source event) → trigger match → `mcp_wake` on target agent space.

## 1. Push and promote `daily-brief`

Use your flow space (example `spc_daily_brief`):

```bash
export MURRMURE_HUB_URL=https://api.murrmure.dev   # or self-hosted URL
export MURRMURE_TOKEN=tok_admin_or_install
export MURRMURE_SPACE_ID=spc_daily_brief

mrmr flow push --space spc_daily_brief --json
```

Then in **Configure → Flows** run:

1. Validate
2. Test
3. Promote
4. Apply live

`brief.requested` will appear in trigger event catalog only after live apply.

## 2. Prepare source and target spaces

- **Source space**: where `daily-brief` runs and emits `brief.requested`
- **Target space**: where the agent is connected for wake delivery

You can use one space for both, or split them:

- source: `spc_daily_brief`
- target: `spc_agent_personal`

## 3. Register the trigger in Configure

Open **Configure → [source space] → Triggers → Register trigger** and set:

| Field | Value |
|-------|-------|
| Source space id | `spc_daily_brief` |
| Event type | `brief.requested` |
| Action type | `mcp_wake` |
| Target space id | `spc_agent_personal` (or same as source) |
| Wake label | `handle_brief_requested` |
| Payload map | `instance_id` ← `$.payload.instance_id`, `request_id` ← `$.payload.request_id` |

Canonical action shape:

```json
{
  "type": "mcp_wake",
  "target_space_id": "spc_agent_personal",
  "wake_label": "handle_brief_requested",
  "payload_map": {
    "instance_id": "$.payload.instance_id",
    "request_id": "$.payload.request_id"
  }
}
```

Suggested dedup:

```json
{
  "key_jsonpaths": ["$.payload.instance_id", "$.payload.request_id"],
  "window_seconds": 86400
}
```

## 4. Trigger delivery log: pending vs resolved

After clicking **Run daily brief**, inspect **Configure → Triggers → Delivery log**:

| Delivery log state | Meaning |
|--------------------|---------|
| Pending / in-flight | Event matched, wake dispatch still processing |
| Delivered | Target MCP session accepted the wake |
| Failed | Dispatch error (offline session, policy, harness mismatch) |
| Dropped (dedup) | Duplicate request in dedup window |

For troubleshooting, a delivery row is considered resolved once it reaches a terminal outcome (`delivered`, `failed`, or drop reason).

## 5. Verify event catalog and test fire

- Confirm `brief.requested` appears in event catalog.
- Use **test fire** (if available in your build) to send a synthetic wake.
- Ensure the target agent session is connected before running from canvas.

## Next

[Part 3 — Connect the agent wake handler →](./03-connect-agent)
