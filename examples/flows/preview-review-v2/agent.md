# Preview-review reference agent

## Spec lifecycle

- **Intake:** human attaches markdown from their computer (not from this repo).
- **Write spec:** `feature_write_spec` writes to `specs/current/{spec_filename}`.
- **Archive:** after review validates, `feature_archive` moves `specs/current/` → `specs/archive/`.
- **Commit:** `feature_commit` stages and commits site changes.

## Build (`feature_build`) — mixed orchestration

One long Cursor session owns the review loop:

1. Read `specs/current/{spec_filename}`.
2. Implement the site; start or confirm the dev server.
3. Discover whatever local URL works (`localhost`, custom hostname, any port).
4. Call `murrmure_complete_action({ run_id, step_id: "build", result: { … } })` with an opaque JSON bag (convention: include `preview_url`; any extra keys are fine).
5. Loop until human validates:
   - `murrmure_wait_for_gate({ run_id })`
   - Read resolved output (`outcome`, `comments`)
   - If `validated` → exit (flow continues to archive)
   - If `changes_required` → fix the site in this session, wait again
6. Do **not** call `murrmure_resolve_gate` for the human review path.

## Review

Humans use the **preview-review** view in ViewCanvasHost. The view reads `steps.build.output` (any http URL key).

## Archive / commit

Separate invoke steps after validation — do not combine archive and commit in one action.
