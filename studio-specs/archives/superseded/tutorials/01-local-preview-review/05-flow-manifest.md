# Part 5 — Flow manifest

The flow is portable protocol: steps, branches, schemas, and control. Views and
agent commands are bound separately in `.mrmr/space/handlers.yaml`.

## Create the manifest

`.mrmr/flows/preview-review/flow.manifest.yaml`:

```yaml
apiVersion: murrmure.flow/v1
name: preview-review
description: Spec intake → write → parent-owned build/review loop → archive → commit

triggers:
  manual: true

steps:
  - id: intake
    description: Human attaches spec markdown.
    branches:
      continue:
        schema:
          type: object
          required: [spec_filename, reviewer]
        artifact_slots:
          spec: { description: Attached spec markdown, max_bytes: 1048576 }
        route: { step: write_spec }
      cancel:
        schema: { type: object }
        route: { run: failed }

  - id: write_spec
    description: Agent writes spec to repo.

  - id: build
    description: Coordinate build and human review children until validated.
    branches:
      completed:
        schema:
          type: object
          required: [preview_url]
          properties:
            preview_url: { type: string }
        route: { step: archive }
      failed:
        schema: { type: object }
        route: { run: failed }
    steps:
      - id: build-loop
        description: Implement or revise the site and report its preview.
        branches:
          completed:
            schema:
              type: object
              required: [preview_url]
              properties:
                preview_url: { type: string }
            resume: build
          failed:
            schema: { type: object }
            resume: build
      - id: review
        description: Human validates the current preview.
        branches:
          validated:
            schema: { type: object }
            resume: build
          changes_required:
            schema:
              type: object
              properties:
                comments: { type: array }
            resume: build
          cancel:
            schema: { type: object }
            route: { run: failed }

  - id: archive
    description: Archive the accepted spec.

  - id: commit
    description: Commit the result.
```

There is no top-level review. `build.build-loop` and `build.review` are direct
declared children of `build`.

## How the loop runs

1. `build` opens first with both child ids in `declared_children`.
2. Its resolver calls `murrmure_open_child_step` for `build.build-loop`. The
   parent becomes `yielded` and its assignment ends.
3. The child resolves and `resume: build` returns its branch, payload, artifacts,
   and iteration as `returned_child`.
4. The fresh parent assignment opens `build.review`.
5. `changes_required` resumes the parent, which opens `build.build-loop` for a
   new iteration. `validated` resumes the parent, which resolves its own
   `completed` branch.

`failed` from `build-loop` returns to the parent so the coordinator decides what
to do. `cancel` on review deliberately fails the run immediately.

## Data flow

```text
intake artifact + payload
  └─► write_spec
        └─► build (open)
              ├─ yield → build.build-loop → returned_child(preview_url)
              ├─ yield → build.review → returned_child(changes_required)
              ├─ yield → build.build-loop → returned_child(preview_url)
              └─ yield → build.review → returned_child(validated)
                    └─► build resolves completed → archive → commit
```

## Checkpoint

- [ ] Five top-level steps: intake, write_spec, build, archive, commit
- [ ] Children return only through `resume: build`
- [ ] Parent alone chooses and activates the next direct child
- [ ] Immediate run failure is explicit with `route: { run: failed }`
- [ ] No resolver modality or View identity appears in the manifest

## Next

[Part 6 — Build the views →](./06-build-views)
