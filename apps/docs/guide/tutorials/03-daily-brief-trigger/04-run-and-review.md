# Part 4 — Run and review

Run one full request from button click to resolution.

## 1. Start from the canvas

Open **Runtime → [daily brief space]** and load the `daily-brief` canvas.

Click **Run daily brief**.

## 2. Observe Studio communication sequence

After click, confirm this order:

1. Capability server creates instance in `pending_agent`.
2. Capability server appends event `brief.requested`.
3. Trigger matches event and dispatches `mcp_wake`.
4. Delivery log row moves pending/in-flight → delivered.
5. Agent handles `handle_brief_requested`.
6. Agent calls `submit_brief_output`.
7. Instance transitions to `pending_review` (or directly `resolved` when `auto_resolve: true`).

If step 4 ends in `failed`, fix target MCP connectivity and trigger config before retrying.

## 3. Human review path (`pending_review`)

When `auto_resolve` is false:

- Canvas shows submitted markdown/json output.
- Instance is `pending_review`.
- Human clicks **Mark done**.
- Instance transitions to `resolved`.

## 4. Auto-resolve path (`pending_agent` → `resolved`)

When agent submits with `auto_resolve: true`:

- Studio records output.
- Transition `submit_and_resolve` fires.
- Instance is immediately `resolved`.
- Human can still open the instance history in Runtime/Audit.

## 5. Pending vs resolved checks

| Layer | Pending signal | Resolved signal |
|-------|----------------|-----------------|
| Trigger delivery log | Row in pending/in-flight | Row in terminal outcome (`delivered`, `failed`, dedup drop) |
| Agent wait/wake | Wake not processed or wait still blocking | Wake handled and submit call completed |
| Human review step | State `pending_review`, Mark done action available | State `resolved` |

## 6. Verify final state

| Where | Expected |
|-------|----------|
| Runtime instance badge | `resolved` |
| Runtime/Audit events | `brief.requested` → `brief.output_submitted` (or direct resolve path) → `brief.resolved` |
| Trigger delivery log | `delivered` for successful runs |

## Daily usage recap

1. Click **Run daily brief**.
2. Agent wakes and submits formatted output.
3. Review in canvas.
4. Mark done (or let auto-resolve complete).

## Related

- [Tutorial index](./index)
- [Configuration (triggers)](../../configuration)
- [Connect your agent (MCP)](../../agents-mcp)
