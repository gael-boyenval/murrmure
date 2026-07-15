# Feature build (contract-driven, nested review)

Read `agent.md` first. Murrmure tools must be connected (`step:resolve`, `space:read`).

## Contract file loop

The hub injects **`MURRMURE_STEP_CONTRACT`** (JSON) and writes **`active-step-contract.json`** on every step transition.

1. Read the injected contract in your prompt (or parse `MURRMURE_STEP_CONTRACT` from the environment).
2. Read the active contract at:
   ```
   .mrmr/dev/runs/{run_id}/active-step-contract.json
   ```
3. As parent `build`, activate one direct child with
   **`murrmure_open_child_step`**. The assignment ends after successful yield.
4. A returned child creates a new parent assignment with `reason: resumed` and
   `returned_child`; make the next decision from that context.

Optional discovery: **`murrmure_list_step_contracts`** returns the active slice + `graph_digest`.

## Build + review loop (nested under `build`)

The `feature_build` binding owns the parent decision loop. Each open or resume is
a fresh shell assignment. Review is `build.review`, owned by its bound View.

1. On the initial parent assignment, open `build.build-loop`.

```json
murrmure_open_child_step({
  "run_id": "<run_id from contract>",
  "parent_step_id": "build",
  "child_step_id": "build.build-loop",
  "idempotency_key": "build-iteration-1"
})
```

2. The build child implements the spec, starts the preview, and calls
   `murrmure_resolve_step` for `build.build-loop` with `preview_url`.
3. On the resumed parent assignment, inspect that returned payload and open
   `build.review` with a new idempotency key.
4. On `changes_required`, open `build.build-loop` again. The child receives the
   review output through run context and produces the next preview iteration.
5. On `validated`, resolve parent `build` as `completed` with the accepted
   `preview_url`. On child failure, resolve `build` as `failed`.

## Rules

- The parent opens children; child resolvers resolve only their assigned child.
- Never resolve **`build.review`** yourself — humans use the view.
- Never `murrmure_resolve_gate` or legacy complete-action MCP.
- Never keep working after a successful child open; the yielded assignment has
  been revoked.
