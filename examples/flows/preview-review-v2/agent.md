# Preview-review reference agent

## Connect MCP

Use the thin bridge only: `murrmure-mcp` with `MURRMURE_HUB_TOKEN`.
Run `mrmr grant mint --space spc_... --label "cursor-agent"` then `mrmr grant use --space spc_...`.

## Spec lifecycle

- **Intake:** human attaches a spec file via the intake view. Hub stores it as step artifact `intake.spec` under `.mrmr.temp/runs/{run_id}/steps/intake/`.
- **Write spec:** `feature_write_spec` copies from `{{murrmure.step.intake.artifact.spec.path}}` into `specs/current/{spec_filename}`. When done, call **`murrmure_resolve_step`** on **`write_spec`** with `branch: "completed"` (see injected `{{murrmure.agentStepContract}}` / `MURRMURE_STEP_CONTRACT`).
- **Archive / commit:** unchanged — see flow manifest.

## Build (`feature_build`)

Read `{{murrmure.step.intake.artifact.spec.path}}` or `specs/current/{spec_filename}` after write_spec. Complete steps via `murrmure_resolve_step` per `active-step-contract.json`. Wait for human review with `murrmure_wait_for_run` — do not invoke review yourself.
