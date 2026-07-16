# Part 2 — Build the flow manifest

**Concept:** A **flow** is nothing more than a **description** — a shared way to say how work should unfold: an event succession, a loop, or a process. The file does not run code, spawn agents, or open UI. **A flow by itself does nothing.** Humans, the hub, handlers, and views do the work when something else starts a run against that description.

The manifest lives at `.mrmr/flows/my-dev-flow/flow.manifest.yaml`. Execution (handlers) and human UI (views) are space-owned and come later. The manifest stays **protocol only** — no shell commands, no view code, no indexed action binding.

We build **`my-dev-flow`** in two passes: first the flow shell, then a single **intake** step.

The archived v2 tutorial (non-normative) adds handlers, views, agent steps, and strict apply on top of this same manifest shape; it is superseded by this v3 path.

## Step 1 — Flow shell

Create the flow file:

```text
.mrmr/flows/my-dev-flow/flow.manifest.yaml
```

Start with the header only — no `steps` yet:

```yaml
apiVersion: murrmure.flow/v1
name: my-dev-flow
description: My first dev workflow

triggers:
  manual: true
```

### What is a flow?

A flow manifest is **communication** — the contract everyone reads (humans, agents, the hub) to stay aligned on what should happen and in what order.

It describes:

- **Start conditions** — what kinds of requests may begin a run (`triggers`)
- **Steps** — the sequence (and later, loops and branches) of work
- **Outcomes** — what each step may resolve to and where the run goes next

Writing the YAML does not start a run, index the space, or dispatch a handler. **`mrmr space apply`** publishes the description to the hub; **Run** in Desktop, an event, or `mrmr flow run` starts an actual run. Until then, the file is inert documentation in your repo.

`apiVersion: murrmure.flow/v1` pins the manifest shape the compiler expects.

### Triggers — start conditions in the description

`triggers` is part of the same description. It records **which kinds of starts are allowed** for this flow — not an active listener. Something else (you clicking **Run**, a schedule job, another flow) must still act; the manifest only says whether that action is valid.

| Key | Type | Meaning |
|-----|------|---------|
| `manual` | boolean | A human or CLI may request a run (Desktop **Run**, `mrmr flow run`). `true` for this tutorial. |
| `flow_call` | boolean | Another flow may start this one as a sub-flow (`start_flow` step). |
| `events` | list | Event types that may start the flow, e.g. `{ type: "spec.published", source: "webhook" }`. |
| `schedule` | string or `null` | Cron expression for scheduled starts (e.g. `0 9 * * *`). `null` = not schedulable. |
| `idempotency` | string | Optional dedup key template for event/schedule starts. |

For this tutorial, **`manual: true`** is enough.

Human UI does **not** belong under `triggers` or the portable flow. Spaces bind
Views to steps through `handlers.yaml` ([Part 3](./03-build-intake-view)).

### Default branches (linear steps)

For a normal pipeline step, you only need **`id`** and **`description`**. The compiler adds two branches:

| Branch | Meaning |
|--------|---------|
| **`completed`** | Success — opens the **next step** in the `steps` list (last step ends the run) |
| **`failed`** | Failure — compiles to the canonical run-failed route |

You will use default branches for **`write_spec`** and **`cleanup`** in [Part 5](./05-extend-flow-and-handlers) and [Part 6](./06-cleanup-and-commit). **`build`** declares explicit **`branches`** because its **`completed`** resolve must carry **`commit_message`** and **`description`** in the payload.

**Intake is different** — it is a human checkpoint with **Submit** / **Cancel** and a file upload, so you declare **`continue`** and **`cancel`** explicitly (not `completed` / `failed`).

Human steps with custom outcomes still declare **`branches`** explicitly (intake uses **`continue`** / **`cancel`** in [Part 2](./02-build-minimal-flow)).

## Step 2 — One step: intake only

Open the file from Step 1 and make it match this complete manifest:

<!-- tutorial-v3-fence:part-2-flow -->
```yaml
apiVersion: murrmure.flow/v1
name: my-dev-flow
description: My first dev workflow

triggers:
  manual: true

steps:
  - id: intake
    description: Human attaches one spec markdown file.
    branches:
      continue:
        schema:
          type: object
          required: [spec]
        artifact_slots:
          spec:
            description: The spec markdown file
            media_types: [text/markdown, text/plain]
            extensions: [.md, .markdown, .txt]
            min_bytes: 1
            max_bytes: 1048576
        route: { run: completed }
      cancel:
        schema: { type: object }
        route: { run: failed }
```

Save the file. Do not run `mrmr space apply` yet — add the intake view in [Part 3](./03-build-intake-view) first.

### What you added

| Key | In this step |
|-----|----------------|
| `id` | Step name — `intake`. Used when resolving the step and in the journal. |
| `description` | What happens here, for humans reading the manifest. |
| `branches` | **Explicit** — human intake uses `continue` / `cancel`, not the default `completed` / `failed`. |

### Branches on `intake`

Each key under `branches` is an **outcome name** — what gets passed to `resolve_step` as `branch: "continue"` or `branch: "cancel"`.

**`continue`** — success path:

- `schema.required: [spec]` — resolve **must** include the `spec` artifact. Names in `required` that match `artifact_slots` are **file slots**, not payload fields — there is no `spec_filename` (or other form data) on this branch.
- `artifact_slots.spec` — one non-empty Markdown/plain-text file (max 1 MiB). The original filename travels with the artifact reference.
- `route: { run: completed }` — no further step; the run ends successfully after intake.

**`cancel`** — abort:

- `route: { run: failed }` — run ends as failed.
- `schema: { type: object }` — no extra fields required.

That is all you need for this step. Loops and richer routing appear in the archived v2 tutorial (non-normative), superseded by this v3 path.

## Checkpoint

- [ ] `.mrmr/flows/my-dev-flow/flow.manifest.yaml` exists with flow shell + single `intake` step
- [ ] Flow name is **`my-dev-flow`**
- [ ] `triggers.manual: true`
- [ ] `intake` has explicit `branches.continue` + `branches.cancel` and no resolver/View modality
- [ ] `continue` is **file-only**: `schema.required: [spec]` + `artifact_slots.spec` — no payload fields like `spec_filename`

## Next

[Part 3 — Build the intake view →](./03-build-intake-view)
