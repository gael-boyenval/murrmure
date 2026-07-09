# Feature build (contract-driven, nested review)

Read `agent.md` first. Murrmure tools must be connected (`action:invoke`, `step:resolve`, `space:read`).

## Contract file loop

The hub injects **`MURRMURE_STEP_CONTRACT`** (JSON) and writes **`active-step-contract.json`** on every step transition.

1. Read the injected contract in your prompt (or parse `MURRMURE_STEP_CONTRACT` from the environment).
2. During long sessions, re-read:
   ```
   .mrmr.temp/runs/{run_id}/active-step-contract.json
   ```
3. Complete the active step with **`murrmure_resolve_step`** using the branch schemas in the contract.
4. After resolving, **`murrmure_wait_for_run`** until the run advances or the contract file changes.

Optional discovery: **`murrmure_list_step_contracts`** returns the active slice + `graph_digest`.

## Build + review loop (nested under `build`)

One **`feature_build`** shell spawn owns the whole loop. Review is **`build.review`** — the **engine** opens it after you resolve **`build.build-loop`**. Do **not** invoke or resolve review yourself.

1. Implement from `specs/current/{spec_filename}` or the injected path `{{murrmure.step.intake.artifact.spec.path}}` (see `inputs_from_run` in the contract file).
2. Start dev server; note the working preview URL.
3. **Advance to human review** (engine opens `build.review`):

```json
murrmure_resolve_step({
  "run_id": "<run_id from contract>",
  "step_id": "build.build-loop",
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

Poll `murrmure_get_run` until `build.review` is terminal (`completed` or `failed`).

5. On `changes_required`, read `steps.build.review.output.comments`, fix locally in this session. The engine reopens **`build.build-loop`** — resolve it again with an updated `preview_url`. Do **not** spawn a new `cursor agent` subprocess.

6. On `validated`, exit — parent **build** completes; flow runs **archive** then **commit** (engine dispatches; resolve those steps when prompted).

## Rules

- Use **`murrmure_resolve_step`** on **`build.build-loop`** only for agent completions during the build session.
- Never resolve **`build.review`** yourself — humans use the view.
- Never `murrmure_resolve_gate` or legacy complete-action MCP.
- Re-read `active-step-contract.json` after each transition — env vars do not update mid-process.
