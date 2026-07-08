# Part 5 — Flow manifest

The flow manifest is **thin orchestration**: checkpoint ids, action names, param wiring. No build logic.

## Step 1 — Create the file

`murrmure/flows/preview-review/flow.manifest.yaml`:

```yaml
apiVersion: murrmure.flow/v1
name: preview-review
description: Spec intake → write → build (agent loop) → review → archive → commit

triggers:
  manual: true

start:
  manual: true

steps:
  - id: intake
    checkpoint:
      view: preview-review-intake
      on_resolve:
        default: { goto: write_spec }
        cancel: { fail: true }

  - id: write_spec
    invoke:
      space: "{{origin_space}}"
      action: feature_write_spec
      params:
        spec_markdown: "{{input.spec_markdown}}"
        spec_filename: "{{input.spec_filename}}"

  - id: build
    invoke:
      space: "{{origin_space}}"
      action: feature_build
      params:
        spec_filename: "{{input.spec_filename}}"

  - id: review
    checkpoint:
      view: preview-review
      assignees: ["{{input.reviewer}}"]
      on_resolve:
        when: output.outcome
        values:
          validated: { goto: archive }
          changes_required: { goto: review }
        default: { goto: archive }
        cancel: { fail: true }

  - id: archive
    invoke:
      space: "{{origin_space}}"
      action: feature_archive
      params:
        spec_filename: "{{input.spec_filename}}"

  - id: commit
    invoke:
      space: "{{origin_space}}"
      action: feature_commit
      params:
        spec_filename: "{{input.spec_filename}}"
```

## Step 2 — Walk through each step

### `intake` (checkpoint)

- Run pauses; Desktop opens **intake view** in ViewCanvasHost
- Human attaches spec from disk → on v2.2 step contracts use **`artifact_slots.spec`** + view upload (`artifacts_out`) instead of inline `spec_markdown`
- Legacy: `submit({ spec_markdown, spec_filename, reviewer })` — payload becomes **run input** for the whole run

### `write_spec` (invoke)

- Hub calls `feature_write_spec` with spec content from intake
- Agent writes `specs/current/{spec_filename}`

### `build` (invoke)

- Hub calls `feature_build` once per run
- Agent implements site, discovers preview URL, calls **`murrmure_complete_action`**
- Agent loops **`murrmure_wait_for_gate`** on feedback — same session, no re-invoke

### `review` (checkpoint)

- Live-review view reads **`steps.build.output`** for iframe URL
- **Validated** → **archive**
- **Send feedback** → **review** again (agent fixes inside running **build**)

### `archive` (invoke)

- Hub calls `feature_archive`
- Agent moves `specs/current/{file}` → `specs/archive/{file}`

### `commit` (invoke)

- Hub calls `feature_commit`
- Agent commits; returns `commit_message` + `description` in output JSON

## Step 3 — Data flow diagram

```text
intake submit
  └─► input.spec_markdown, input.spec_filename, input.reviewer
        └─► write_spec params
        └─► build / archive / commit params (spec_filename)
write_spec
  └─► specs/current/{file} on disk
build + complete_action
  └─► steps.build.output  ← opaque JSON (preview_url, …)
review submit (feedback)
  └─► steps.review.output.comments
        └─► agent reads via wait_for_gate / get_run (not build re-invoke)
```

## Step 4 — Concepts

| Term | Meaning |
|------|---------|
| **Checkpoint** | Human must act; run status `input-required` |
| **Invoke** | Hub dispatches an action immediately |
| **Run input** | Shallow-merged from first checkpoint output |
| **on_resolve** | Routing after human submits a checkpoint |
| **complete_action** | Agent reports step result while invoke still running |

## Checkpoint

- [ ] Six steps: intake, write_spec, build, review, archive, commit
- [ ] `changes_required` routes to **review**, not **build**
- [ ] Archive runs before commit

## Next

[Part 6 — Build the views →](./06-build-views)
