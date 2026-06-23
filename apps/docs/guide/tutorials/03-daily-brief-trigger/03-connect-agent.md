# Part 3 — Connect the agent

This page covers grant setup, wake handling, and the `submit_brief_output` call.

## 1. Mint the worker grant

In **Configure → [target space] → Agent grants → Mint grant**:

- Template: Worker
- Scopes: include `space:read`, `state:transition`, `event:emit`
- Capability ACL: include `daily-brief`

Without ACL + live capability, `submit_brief_output` will not appear in MCP.

## 2. MCP client config

Use the minted token in your client config (example Cursor):

```json
{
  "mcpServers": {
    "studio": {
      "command": "studio-hub-mcp",
      "env": {
        "STUDIO_HUB_URL": "https://api.studio.dev",
        "STUDIO_HUB_TOKEN": "tok_...",
        "STUDIO_SPACE_ID": "spc_agent_personal"
      }
    }
  }
}
```

Reload MCP and verify:

- `get_space_state` works
- `contract_versions` works
- `submit_brief_output` is listed

## 3. Wake handler contract

When trigger delivers:

- `wake_label`: `handle_brief_requested`
- payload: `{ instance_id, request_id }`

Agent behavior:

1. Accept wake payload.
2. Gather from your local email/calendar/todo tools.
3. Build formatted output in markdown + structured json.
4. Call `submit_brief_output`.

One-line data source rule: the agent gathers from your local tools; Studio only coordinates state, wake, and review.

## 4. `submit_brief_output` example payload

```json
{
  "instance_id": "ins_123",
  "brief_markdown": "# Daily brief\n\n## Meetings\n- 10:00 Product sync\n\n## Priorities\n1. Ship trigger docs\n2. Review open PRs\n3. Prepare standup notes",
  "brief_json": {
    "meetings": ["10:00 Product sync"],
    "deadlines": ["Docs publish by 17:00"],
    "top_actions": ["Ship trigger docs", "Review open PRs", "Prepare standup notes"]
  },
  "auto_resolve": false
}
```

`auto_resolve: false` keeps the human review step (`pending_review`).

`auto_resolve: true` skips review and transitions directly to `resolved`.

## 5. Wait fallback (if wake is unavailable)

If your harness does not process wake callbacks, use platform wait:

1. Track relevant `instance_id`.
2. Call `wait_for_state` until the instance is in `pending_agent`.
3. Then call `submit_brief_output`.

## 6. Agent pending vs resolved semantics

| Agent stage | Pending | Resolved |
|-------------|---------|----------|
| Wake handling | Wake not received yet | Wake payload received and parsed |
| Submit call | Preparing/gathering local data | `submit_brief_output` accepted by Studio |
| Optional wait for done | Waiting on human action | Instance reaches `resolved` |

## Next

[Part 4 — Run and review end-to-end →](./04-run-and-review)
