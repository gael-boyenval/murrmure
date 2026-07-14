# Part 5 — Copy the spec and build

**Concept:** The flow manifest describes **what** happens next; **handlers** in `.mrmr/space/handlers.yaml` describe **how** your space executes each step. Part 4 stopped after **intake** — here you add **`write_spec`** (copy the spec into the repo), then **`build`** (agent implements it and returns a commit subject + description for later).

Linear steps need only **`id`** and **`description`** — the compiler supplies
**`completed`** (next step in line) and **`failed`** (canonical run failure).
See [Part 2 — Default branches](./02-build-minimal-flow#default-branches-linear-steps).

## Before you start

Parts 1–4 done: intake view works, you have run cancel + successful intake with an artifact on disk.

## Step 1 — Extend the manifest (intake → write_spec)

Edit `.mrmr/flows/my-dev-flow/flow.manifest.yaml` from [Part 3](./03-build-intake-view) — point intake at **`write_spec`** and add that step:

```diff
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
             max_bytes: 1048576
-        route: { run: completed }
+        route: { step: write_spec }
       cancel:
         schema: { type: object }
        route: { run: failed }
+
+  - id: write_spec
+    description: Copy intake spec into the repo (shell command).
```

`write_spec` has no `branches` block — the hub injects **`completed`** (run ends for now; you add **`build`** below) and **`failed`**.

## Step 2 — Handler: copy the spec

A **handler** binds execution to a protocol step. When the hub opens **`write_spec`**, it looks up a handler whose **`on`** binding matches `step.opened::my-dev-flow.write_spec`.

Replace the empty handlers from [Part 1](./01-launch-and-create-space) in `.mrmr/space/handlers.yaml` — **start with this one only**:

```diff
 version: 1
 
-handlers: []
+handlers:
+  - id: write_spec_copy
+    on: step.opened::my-dev-flow.write_spec
+    type: shell_spawn
+    complete: auto
+    command: |
+      mkdir -p specs/current
+      cp {{murrmure.step.intake.artifact.spec.path}} specs/current/spec.md
+    timeout_ms: 10000
```

### What each field does

| Field | Role |
|-------|------|
| **`id`** | Handler name in your space — used in logs and journal entries. |
| **`on`** | **When** and **which step** this handler runs. Format: `step.opened::{flow}.{step_id}` — here, run on open of `write_spec` in `my-dev-flow`. |
| **`type: shell_spawn`** | Run a shell command on the linked machine (your space root). |
| **`command`** | The shell command (multiline for readability). Template tokens expand from the **run** before spawn — see below. Working directory defaults to your linked space root; delivery defaults to **fail fast** if the executor is unavailable. |
| **`complete: auto`** | **Who resolves the step after the command finishes.** `auto` = the hub resolves **`write_spec`** on branch **`completed`** when the shell exits **0**. You do not call `murrmure_resolve_step` for this step. |
| **`timeout_ms`** | Kill the shell if it runs longer than this (10 seconds is plenty for `mkdir` + `cp`). |

`contract_keys` is only for **prompt scope** on agent handlers — shell handlers like **`write_spec_copy`** omit it. You add it for **`build`** in Step 5.

### Inputs — where <code v-pre>{{murrmure.step.intake.artifact.spec.path}}</code> comes from

Handlers do not read the manifest for file paths. They read **run state** built from earlier steps:

1. Part 4 — you submitted **`~/Documents/spec.md`** on branch **`continue`**.
2. The hub promoted it under the run scratch tree (`.mrmr/dev/runs/…/steps/intake/spec/`).
3. When **`write_spec`** opens, the hub expands <code v-pre>{{murrmure.step.intake.artifact.spec.path}}</code> to that **absolute path** on disk.

So the command creates `specs/current/` in your repo and copies the intake file there as `specs/current/spec.md`.

**`complete` modes:** `auto` — hub resolves on shell exit 0 (this handler). `explicit` — agent calls **`murrmure_resolve_step`** when done (Step 4 — **`build`**). `cli` — your script calls **`mrmr step resolve`** before exit. Full reference: [Space handlers](../../space-handlers).

## Step 3 — Apply and test copy only

```bash
cd ~/work/my-first-space
mrmr space apply --strict
```

Check `.mrmr/dev/contracts/contract-keys.json` includes `my-dev-flow.write_spec` (the suffix in your handler `on` binding).

Run from Desktop: space → **`my-dev-flow`** → **Run** → attach **`~/Documents/spec.md`** → **Submit**.

```text
step.resolved(intake, continue)
  └─ step.opened(write_spec)
       └─ handler write_spec_copy (cp → specs/current/spec.md)
            └─ step.resolved(write_spec, completed)
                 └─ run.terminal(success)
```

Verify the copy:

```bash
cat specs/current/spec.md
```

You should see the same content as your Documents file.

## Step 4 — Extend the manifest (build)

Add the agent step with an explicit **`completed`** branch — the **schema** is the contract for what the agent must pass on resolve (same idea as intake's **`artifact_slots`**, but payload fields instead of files):

```diff
 steps:
   - id: write_spec
     description: Copy intake spec into the repo (shell command).
+
+  - id: build
+    description: Agent implements the spec and proposes commit subject + description.
+    branches:
+      completed:
+        schema:
+          type: object
+          required: [commit_message, description]
+          properties:
+            commit_message: { type: string }
+            description: { type: string }
+      failed:
+        schema: { type: object }
```

| Branch | Contract |
|--------|----------|
| **`completed`** | Agent resolve **payload** must include **`commit_message`** (git subject) and **`description`** (git body). Hub rejects resolve if either is missing. Routes to the next step in manifest order ([Part 6](./06-cleanup-and-commit) adds **`cleanup`**). |
| **`failed`** | Run ends as failed. |

`write_spec` still uses default branches. **`build`** only customizes branch **schemas** — `next` is inferred from step order.

## Step 5 — Handler: build

Append to `.mrmr/space/handlers.yaml`:

```diff
   - id: write_spec_copy
     on: step.opened::my-dev-flow.write_spec
     ...
+
+  - id: dev_build
+    on: step.opened::my-dev-flow.build
+    contract_keys:
+      - my-dev-flow.build
+    type: shell_spawn
+    complete: explicit
+    prompt: |
+      Read specs/current/spec.md and implement what it asks for in this repo.
+
+      Workflow:
+      1. Read the spec under specs/current/spec.md
+      2. Make the code changes the spec describes
+      3. Resolve build on branch completed with commit_message and description
+         (conventional commit subject + one-sentence summary of what you built)
+      4. If you cannot finish, resolve build on branch failed
+    command: cursor agent -p --force {{prompt}}
+    timeout_ms: 3600000
```

| Field | Role |
|-------|------|
| **`on`** | Dispatches this handler when **`build`** opens. |
| **`contract_keys`** | **Prompt API only** — which catalog keys to compile into contract markdown appended to the agent prompt. Here one key: **`my-dev-flow.build`** (must match `contract-keys.json`). Dispatch uses **`on`**; keys do not select the handler. |
| **`complete: explicit`** | The agent decides when work is done and **must** call **`murrmure_resolve_step`**. |
| **`prompt`** | Your **Task** — the workflow the agent should follow. Keep Murrmure mechanics out of the task; the protocol block carries contracts and tools. |

### How the hub builds the full agent prompt

When **`build`** opens, the hub assembles two blocks:

1. **Task** — your handler `prompt:` (workflow steps; template tokens expanded at spawn).
2. **Murrmure protocol** — versioned and auto-generated from **`contract_keys`**:
   active branch schemas and complete **`murrmure_resolve_step`** calls with live IDs.

Every injected protocol block starts with:

<!-- tutorial-v3-fence:part-5-agent-protocol-prefix -->
```text
Protocol: murrmure.agent/v1
```

| `contract_keys` count | Protocol contents |
|----------------------|-------------------|
| **One** (this handler) | **Contracts** — one MCP call per branch |
| **More than one** (subgraph owner — [full tutorial](../01-local-preview-review/04-prompt-triggers)) | **Handler scope** + **Contracts** + **Discovery** |

### Extract — full prompt sent to the agent

Abbreviated; single-key handler (`contract_keys: [my-dev-flow.build]`):

```text
<!-- MURRMURE_TASK_BEGIN -->
# Task

Read specs/current/spec.md and implement what it asks for in this repo.

Workflow:
1. Read the spec under specs/current/spec.md
2. Make the code changes the spec describes
3. Resolve build on branch completed with commit_message and description
   (conventional commit subject + one-sentence summary of what you built)
4. If you cannot finish, resolve build on branch failed

<!-- MURRMURE_TASK_END -->

<!-- MURRMURE_PROTOCOL_BEGIN -->
# Murrmure protocol
Protocol: murrmure.agent/v1

## Contracts
### Active step: build
Agent implements the spec and proposes commit subject + description.

Branch `completed`:
  Required payload: commit_message, description
  Then: run completes
  murrmure_resolve_step({
    run_id: "run_01J8K2M4N6P0Q2R4",
    step_id: "build",
    branch: "completed",
    payload: { commit_message: "…", description: "…" }
  })

Branch `failed`:
  Then: fail run
  murrmure_resolve_step({
    run_id: "run_01J8K2M4N6P0Q2R4",
    step_id: "build",
    branch: "failed"
  })
<!-- MURRMURE_PROTOCOL_END -->
```

Each branch lists the full MCP call with `run_id` and `step_id` filled at spawn.

**Subgraph-owner handlers** (multiple `contract_keys`) additionally receive **Handler scope** and **Discovery** — see `feature_build` in the [full tutorial](../01-local-preview-review/04-prompt-triggers).

After Steps 1–5, the complete flow manifest is:

<!-- tutorial-v3-fence:part-5-flow -->
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
        route: { step: write_spec }
      cancel:
        schema: { type: object }
        route: { run: failed }

  - id: write_spec
    description: Copy intake spec into the repo (shell command).

  - id: build
    description: Agent implements the spec and proposes commit subject + description.
    branches:
      completed:
        schema:
          type: object
          required: [commit_message, description]
          properties:
            commit_message: { type: string }
            description: { type: string }
      failed:
        schema: { type: object }
```

The complete space handler catalog is:

<!-- tutorial-v3-fence:part-5-handlers -->
```yaml
version: 1
run_policies:
  - flow: my-dev-flow
    max_concurrent_runs: 1
handlers:
  - id: intake_view
    on: step.opened::my-dev-flow.intake
    type: view_resolver
    view: spec-intake

  - id: write_spec_copy
    on: step.opened::my-dev-flow.write_spec
    type: shell_spawn
    complete: auto
    command: |
      mkdir -p specs/current
      cp {{murrmure.step.intake.artifact.spec.path}} specs/current/spec.md
    timeout_ms: 10000

  - id: dev_build
    on: step.opened::my-dev-flow.build
    contract_keys:
      - my-dev-flow.build
    type: shell_spawn
    complete: explicit
    prompt: |
      Read specs/current/spec.md and implement what it asks for in this repo.

      Workflow:
      1. Read the spec under specs/current/spec.md
      2. Make the code changes the spec describes
      3. Resolve build on branch completed with commit_message and description
         (conventional commit subject + one-sentence summary of what you built)
      4. If you cannot finish, resolve build on branch failed
    command: cursor agent -p --force {{prompt}}
    timeout_ms: 3600000
```

### Why `run_policies`?

The catalog's `run_policies` entry caps `my-dev-flow` at **one non-terminal run
at a time** in this space. The agent mutates the repo in `build`, so a second
concurrent run would race the first. `flow` is the applied flow's `name`
(`my-dev-flow`); `max_concurrent_runs: 1` means a second manual **Run** while the
first is still in `build` is rejected with `409 FLOW_CONCURRENCY_LIMIT` (and the
blocking run id) instead of silently stacking. No entry means unlimited — useful
for read-only or parallel-safe flows. Full reference:
[Space handlers → Run policies](../../space-handlers#run-policies).

Re-apply:

```bash
mrmr space apply --strict
```

## Step 6 — Run through build

Same **`~/Documents/spec.md`** from Part 4. Desktop → **Run** → Submit. Let the agent finish and resolve **`build`**.

```text
step.resolved(intake, continue)
  └─ step.opened(write_spec) → write_spec_copy
       └─ step.resolved(write_spec, completed)
            └─ step.opened(build) → dev_build (agent)
                 └─ murrmure_resolve_step(build, completed, { commit_message, description })
                      └─ run.terminal(success)   ← no cleanup step yet
```

Verify implementation and resolve payload:

```bash
cat specs/current/spec.md
# In Desktop journal or via murrmure_get_run — build resolved with commit_message + description
```

The spec is still under **`specs/current/`** — archiving and committing happen in [Part 6](./06-cleanup-and-commit).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| No resolver runs | `on` binding mismatch | Match `step.opened::my-dev-flow.{step}` to `contract-keys.json`; flow name `my-dev-flow` |
| Run stops after intake | Not applied / wrong route | `route: { step: write_spec }` on intake `continue`; re-apply |
| `cp` failed in journal | Bad artifact path | Confirm Part 4 intake succeeded; check handler command |
| `EXECUTOR_UNAVAILABLE` | Shell cannot run | Space linked; hub running — default delivery fails fast; fix executor, re-run |
| `build` stuck open | Agent did not resolve | Nudge: `murrmure_resolve_step` on `build` / `completed` with payload |
| Build resolve rejected | Payload missing required fields | Hub validates against **`completed`** schema — pass `commit_message` and `description` |

## Checkpoint

- [ ] Manifest: `intake` → `write_spec` → `build`
- [ ] **`write_spec_copy`** handler understood (`on` binding, `complete: auto`, artifact path input)
- [ ] **`dev_build`** Task describes workflow; protocol shows one `murrmure_resolve_step` call per branch
- [ ] **`build`** resolve passes `commit_message` + `description` (schema-enforced)
- [ ] `specs/current/spec.md` exists; agent changes present in repo

## Next

[Part 6 — Cleanup and commit →](./06-cleanup-and-commit)
