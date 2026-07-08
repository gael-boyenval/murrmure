---
name: feature-build
description: Build site, resolve build step, and wait for human review via murrmure_wait_for_run. Use when feature_build runs.
---

# Feature build (mixed orchestration)

Read `agent.md` first. Murrmure MCP must be connected (`action:invoke`, `step:resolve`, `space:read`).

## Build + review loop (same session)

1. Implement from `specs/current/{spec_filename}`.
2. Start dev server; note the working preview URL (any hostname/port).
3. **Advance flow to review** (while this shell action is still running):

```json
murrmure_resolve_step({
  "run_id": "<run_id from prompt>",
  "step_id": "build",
  "branch": "completed",
  "payload": {
    "preview_url": "http://your-local-url:3000"
  }
})
```

4. **Wait for human** in the review view:

```
murrmure_wait_for_run({ "run_id": "<run_id>" })
```

Poll `murrmure_get_run` until `steps.review` is terminal (`completed` or `failed`).

5. On `changes_required`, read `steps.review.output.comments`, fix locally, call `resolve_step` on **build** again with updated `preview_url`. Do **not** spawn a new `cursor agent` subprocess.

6. On `validated`, exit — flow runs **archive** then **commit** (engine dispatches; resolve those steps when prompted).

## Rules

- Use **`murrmure_resolve_step`** for all agent step completions (do not use legacy complete-action MCP).
- Never `murrmure_resolve_gate` for human review (humans use the view).
- Refresh run state with `murrmure_get_run` when you need latest step outputs.
