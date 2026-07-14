# Part 5 — Flow manifest

The flow manifest is **protocol-only orchestration**: step ids, branches, param wiring, nested review under **build**. No build logic and **no `executor.action`** — execution lives in `.mrmr/space/handlers.yaml`.

## Step 1 — Create the file

`.mrmr/flows/preview-review/flow.manifest.yaml`:

```yaml
apiVersion: murrmure.flow/v1
name: preview-review
description: Spec intake → write → build (agent loop + review) → archive → commit

triggers:
  manual: true

start:
  manual: true

steps:
  - id: intake
    description: Human attaches spec markdown.
    presentation:
      view: preview-review-intake
    branches:
      continue:
        schema:
          type: object
          required: [spec_filename, reviewer]
        artifact_slots:
          spec:
            description: Attached spec markdown file
            max_bytes: 1048576
        next: write_spec
      cancel:
        schema: { type: object }
        next: null
        fail_run: true

  - id: write_spec
    description: Agent writes spec to repo.
    role: agent
    branches:
      completed:
        schema: { type: object }
        next: build
      failed:
        schema: { type: object }
        next: null
        fail_run: true

  - id: build
    description: Build site and human review loop until validated.
    role: agent
    orchestration: engine-routed
    steps:
      - id: build-loop
        description: Implement site; resolve when preview URL ready.
        role: agent
        branches:
          completed:
            schema:
              type: object
              required: [preview_url]
              properties:
                preview_url: { type: string }
            goto: review
          failed:
            schema: { type: object }
            fail: true
      - id: review
        description: Human validates preview — wait; do not resolve yourself.
        presentation:
          view: preview-review
          assignees: ["{{input.reviewer}}"]
        branches:
          validated:
            schema: { type: object }
            complete: parent
          changes_required:
            schema:
              type: object
              properties:
                comments: { type: array }
            continue: parent
            goto: build-loop
          cancel:
            schema: { type: object }
            fail: true
    branches:
      completed:
        schema: { type: object }
        next: archive
      failed:
        schema: { type: object }
        next: null
        fail_run: true

  - id: archive
    role: agent
    branches:
      completed:
        schema: { type: object }
        next: commit
      failed:
        schema: { type: object }
        next: null
        fail_run: true

  - id: commit
    role: agent
    branches:
      completed:
        schema: { type: object }
        next: null
      failed:
        schema: { type: object }
        next: null
        fail_run: true
```

There is **no top-level `review` step** — review lives under **`build`** as **`build.review`**.

Notice: agent steps declare **`role: agent`** only. Handlers bind via **`contract_keys`** (`preview-review.write_spec`, `preview-review.build`, etc.) — not `executor: { action: … }` in the manifest.

## Step 2 — Walk through each step

### `intake` (human step)

- Run pauses; Desktop opens **intake view** in ViewCanvasHost
- Human attaches spec from disk — v2.2 uses **`artifact_slots.spec`** on the `continue` branch: the view uploads to the step workdir and resolves with `artifacts_out` (not inline `spec_markdown`)
- `spec_filename` and `reviewer` remain in the resolve **payload**; the spec bytes live under `.mrmr/dev/runs/{run_id}/steps/intake/spec/`

### `write_spec` (agent step)

- Engine opens step → handler **`feature_write_spec`** dispatches on `step.opened`
- Agent copies intake artifact to `specs/current/{spec_filename}` and resolves **`completed`**

### `build` (parent — mixed orchestration)

- Handler **`feature_build`** dispatches once (`kill_on: step.resolved`)
- Engine opens **`build.build-loop`** as the active nested child
- Agent resolves **`build.build-loop`** with `{ preview_url }` when ready
- Engine opens **`build.review`** — agent waits; humans use the view

### `build.review` (nested human step)

- Live-review view reads **`steps.build.build-loop.output.preview_url`** for iframe URL
- **Validated** → `complete: parent` → flow advances to **archive**
- **Send feedback** → `continue: parent` + `goto: build-loop` (agent fixes in same session)

### `archive` / `commit` (agent steps)

- Handlers **`feature_archive`** and **`feature_commit`** dispatch after parent **build** completes

## Step 3 — Data flow diagram

```text
intake submit
  └─► input.spec_filename, input.reviewer + artifact spec
        └─► write_spec / build / archive / commit handler params
write_spec
  └─► specs/current/{file} on disk
build.build-loop resolve
  └─► steps.build.build-loop.output.preview_url
build.review submit (feedback)
  └─► steps.build.review.output.comments
        └─► agent reads via wait_for_run / get_run
```

## Step 4 — Concepts

| Term | Meaning |
|------|---------|
| **Nested step** | Child under a parent (`build.build-loop`, `build.review`) |
| **engine-routed** | Engine opens next step from manifest routes; agent resolves owned steps only |
| **`goto`** | Nested sibling transition (engine opens target) |
| **`complete: parent`** | Nested success closes parent and advances top-level `next` |
| **`resolve_step`** | Unified completion API for agents, views, and `mrmr step resolve` |
| **`contract_keys`** | Stable ids linking manifest steps to handlers (portable across spaces) |

## Checkpoint

- [ ] Five top-level steps: intake, write_spec, build, archive, commit (no top-level review)
- [ ] Nested `build-loop` ⇄ `review` under **build**
- [ ] `changes_required` uses `goto: build-loop`, not re-dispatch **build** handler
- [ ] No `executor.action` anywhere in the manifest
- [ ] Archive runs before commit

## Next

[Part 6 — Build the views →](./06-build-views)
