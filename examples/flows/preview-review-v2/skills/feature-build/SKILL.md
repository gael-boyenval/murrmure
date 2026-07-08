---
name: feature-build
description: Build site, report preview via murrmure_complete_action, and run the wait_for_gate review loop. Use when feature_build runs.
---

# Feature build (mixed orchestration)

Read `agent.md` first. Murrmure MCP must be connected (`action:invoke`, `space:read`).

## Build + review loop (same session)

1. Implement from `specs/current/{spec_filename}`.
2. Start dev server; note the working preview URL (any hostname/port).
3. **Advance flow to review** (while this shell action is still running):

```json
murrmure_complete_action({
  "run_id": "<run_id from prompt>",
  "step_id": "build",
  "result": {
    "preview_url": "http://your-local-url:3000"
  }
})
```

You may add other keys (`dev_command`, custom names) — step output is an opaque bag.

4. **Wait for human** in the review view:

```
murrmure_wait_for_gate({ "run_id": "<run_id>" })
```

5. On `changes_required`, read `comments`, fix locally, call `wait_for_gate` again. Do **not** spawn a new `cursor agent` subprocess.

6. On `validated`, exit — flow runs **archive** then **commit**.

## Rules

- Never `murrmure_resolve_gate` for human review (humans use the view).
- Refresh run state with `murrmure_get_run` when you need latest `steps.review.output`.
- Cross-space preview: use `query_ask` if another space owns the preview URL.
