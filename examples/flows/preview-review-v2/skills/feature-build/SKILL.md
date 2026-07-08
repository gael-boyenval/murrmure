---
name: feature-build
description: Build site using injected step contract and resolve_step. Use when feature_build runs.
---

# Feature build (contract-driven)

Read `agent.md` first. Murrmure MCP must be connected (`action:invoke`, `step:resolve`, `space:read`).

## Contract file loop

The hub injects **`MURRMURE_STEP_CONTRACT`** (JSON) and writes **`active-step-contract.json`** on every step transition.

1. Read the injected contract in your prompt (or parse `MURRMURE_STEP_CONTRACT` from the environment).
2. During long sessions, re-read:
   ```
   .mrmr.temp/runs/{run_id}/active-step-contract.json
   ```
3. Complete the active step with **`murrmure_resolve_step`** using the branch schemas in the contract.
4. After resolving, **`murrmure_wait_for_run`** until the run advances or the next contract file appears.

Optional discovery for complex flows: **`murrmure_list_step_contracts`** returns the active slice + `graph_digest`.

## Build + review loop (linear manifest)

1. Implement from `specs/current/{spec_filename}` (paths may also appear in `inputs_from_run`).
2. Start dev server; note the working preview URL.
3. **Advance flow to review** (while this shell action is still running):

```json
murrmure_resolve_step({
  "run_id": "<run_id from contract>",
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
- Re-read `active-step-contract.json` after each transition — env vars do not update mid-process.
