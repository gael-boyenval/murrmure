# Preview-review reference agent

## Spec lifecycle

- **Intake:** human attaches markdown from their computer (not from this repo).
- **Write spec:** `feature_write_spec` writes to `specs/current/{spec_filename}`.
- **Archive:** after review validates, `feature_archive` moves `specs/current/` → `specs/archive/`.
- **Commit:** `feature_commit` stages and commits site changes.

## Build (`feature_build`) — nested engine-routed loop

One long Cursor session owns the build + review loop under parent step **`build`**:

1. Read `specs/current/{spec_filename}`.
2. Implement the site; start or confirm the dev server.
3. Discover whatever local URL works (`localhost`, custom hostname, any port).
4. Read **`active-step-contract.json`** — active step is **`build.build-loop`**.
5. Call **`murrmure_resolve_step({ step_id: "build.build-loop", branch: "completed", payload: { preview_url: "…" } })`**.
6. The **engine** opens **`build.review`** (human view). You do **not** invoke or resolve review.
7. Loop until human validates:
   - **`murrmure_wait_for_run({ run_id })`**
   - Read `steps.build.review.output` (`validated` / `changes_required`, `comments`)
   - If `changes_required` → fix in this session, resolve **`build.build-loop`** again
   - If parent **build** completes → exit (flow continues to archive)
8. Do **not** call legacy `murrmure_complete_action`, `murrmure_wait_for_gate`, or `murrmure_resolve_gate`.

## Review

Humans use the **preview-review** view in ViewCanvasHost. The view reads build-loop output (e.g. `steps.build.build-loop.output.preview_url`) for the iframe URL.

## Archive / commit

Separate invoke steps after validation — do not combine archive and commit in one action.
