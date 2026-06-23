# Part 3 — Run the feedback loop

This section focuses on Studio communication between MCP and canvas until the instance reaches terminal `resolved`.
You will run one review round, interpret the result, and either finish or loop.

## 1) Agent opens a session for the current preview

Agent MCP call:

```json
{
  "tool": "create_preview_review_session",
  "input": {
    "title": "Homepage pass 1",
    "preview_url": "http://127.0.0.1:5173"
  }
}
```

Expected response includes:

- `instance_id`
- `canvas_path` (or enough identifiers to open the runtime row)
- initial state `pending_review`

Why this step: this creates the contract instance that both actors (agent + human) will coordinate on.

## 2) Agent starts waiting for human review

Agent MCP call:

```json
{
  "tool": "wait_for_human_review",
  "input": { "instance_id": "inst_..." }
}
```

While no human action has happened yet, wait returns:

```json
{ "status": "pending", "state": "pending_review" }
```

This means the agent stays blocked on human input.

Why this step: `wait_for_human_review` is your synchronization point; do not guess human intent from state polling.

## 3) Human reviews in canvas

Human actions in **Runtime → Instances → [your instance]**:

1. Open canvas
2. Inspect preview
3. Click **Approve** or **Request changes**

Canvas action effects:

| Human action | Contract transition | New state | Wait result |
|-------------|---------------------|-----------|-------------|
| Approve | `human_approve` | `resolved` | `status: "resolved", outcome: "validated"` |
| Request changes + comments | `human_request_changes` | `pending_agent` | `status: "resolved", outcome: "changes_required", comments: [...]` |

Why this step: the canvas is the only place where a human decision should trigger contract transitions.

## 4) Agent reacts to wait resolution

### Branch A: validated

If `wait_for_human_review` returns:

```json
{ "status": "resolved", "outcome": "validated", "state": "resolved" }
```

The workflow is done.

### Branch B: changes required

If `wait_for_human_review` returns:

```json
{
  "status": "resolved",
  "outcome": "changes_required",
  "state": "pending_agent",
  "comments": [{ "text": "..." }]
}
```

The agent should fix the code and update the preview, then call:

```json
{
  "tool": "signal_changes_applied",
  "input": {
    "instance_id": "inst_...",
    "preview_url": "http://127.0.0.1:5173"
  }
}
```

That transition returns the instance to `pending_review`, and the agent calls `wait_for_human_review` again.

Why this step: `status: "resolved"` means "the wait call completed", not always "the workflow is complete".

## 4.1) Recommended agent decision logic

Use this mental model after each wait result:

1. If `status` is `pending`: keep waiting
2. If `status` is `resolved` and `outcome` is `validated`: stop
3. If `status` is `resolved` and `outcome` is `changes_required`: apply edits, call `signal_changes_applied`, then wait again

## 5) Repeat until terminal resolution

Loop pattern:

1. Agent waits (`wait_for_human_review`)
2. Human acts in canvas
3. Wait resolves with `validated` or `changes_required`
4. On `changes_required`, agent signals `signal_changes_applied`
5. Repeat

Think in rounds: each round ends only when human action resolves the current wait.

## Pending vs resolved interpretation

| Signal | Means |
|-------|-------|
| Wait `status: "pending"` | Human has not completed this review turn |
| Wait `status: "resolved"` + `changes_required` | Handoff to agent; not done yet |
| Wait `status: "resolved"` + `validated` | Review accepted and workflow done |
| Contract `state: "resolved"` | Terminal completion |

`wait` being resolved does **not** always mean the workflow is done; only `outcome: "validated"` in terminal state means done.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Capability tools missing in MCP | `preview-review` is live and grant ACL includes it |
| Wait stays pending forever | Human has not clicked an action in canvas |
| Wait resolved with changes but loop did not continue | Agent did not call `signal_changes_applied` |
| Wrong page reviewed | Agent passed stale `preview_url`; send updated URL in `signal_changes_applied` |

## Done criteria

You are finished when all are true:

- latest wait result is `status: "resolved"` with `outcome: "validated"`
- instance state is `resolved`
- no further `signal_changes_applied` calls are needed

- [Tutorial index](./index)
- [How Studio fits together](../../how-it-fits-together)
