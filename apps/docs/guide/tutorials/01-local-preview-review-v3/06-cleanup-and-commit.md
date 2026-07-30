# Part 6 — Cleanup and commit

**Concept:** **`build`** leaves the spec in **`specs/current/`** and records **`commit_message`** + **`description`** on its resolve payload. **`cleanup`** is a shell step that **archives** the spec and **commits** using that output — no agent required.

[Part 5](./05-extend-flow-and-handlers) ended with a successful **`build`** resolve. Here you add the last linear step and its handler.

## Before you start

Part 5 done: a full run through **`build`** with `commit_message` and `description` on the resolve payload.

## Step 1 — Extend the manifest (cleanup)

Add **`cleanup`** after **`build`** — no change to **`build`**'s branches; `completed` routes to the next step automatically:

```diff
 steps:
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
+
+  - id: cleanup
+    description: Archive spec and git commit using build output.
```

**`cleanup`** uses default branches — terminal success after archive + commit.

The resulting complete flow manifest is:

<!-- tutorial-v3-fence:part-6-flow -->
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

  - id: cleanup
    description: Archive spec and git commit using build output.
```

## Step 2 — Handler: archive and commit

Append this handler to `.mrmr/space/handlers.yaml`. It moves the live spec into
`specs/archive/` (named with the run id from the environment), then commits
using the **`build`** resolve payload — each dynamic value is one **unquoted**
placeholder argument (the runtime shell-quotes it once):

<!-- tutorial-v3-fence:part-6-cleanup-handler -->
```yaml
  - id: cleanup_archive_commit
    on: step.opened::my-dev-flow.cleanup
    type: shell_spawn
    complete: auto
    command: |
      mkdir -p specs/archive
      mv specs/current/spec.md "specs/archive/${MURRMURE_RUN_ID}.md"
      git add .
      git commit -m {{murrmure.step.build.output.commit_message}} -m {{murrmure.step.build.output.description}}
    timeout_ms: 10000
```

### What each piece does

| Piece | Role |
|-------|------|
| **`MURRMURE_RUN_ID`** | Injected by `shell_spawn` — same run id as Desktop / journal (use it in paths; do not embed placeholders inside a filename token). |
| **`murrmure.step.build.output.commit_message`** | Subject from the agent's **`build`** resolve — <code v-pre>{{murrmure.step.build.output.commit_message}}</code> |
| **`murrmure.step.build.output.description`** | Body from the same resolve — <code v-pre>{{murrmure.step.build.output.description}}</code> |
| **`complete: auto`** | Exit 0 → hub resolves **`cleanup`** on **`completed`**. |

Prior-step fields use the pattern
<code v-pre>{{murrmure.step.STEP_ID.output.FIELD}}</code>
(same `murrmure.step…` family as artifact paths). Legacy
<code v-pre>{{steps.STEP_ID.output.FIELD}}</code> is rejected at apply.

Re-apply:

```bash
cd ~/work/my-first-space
mrmr space apply --strict
git add -- .gitignore .mrmr/flows .mrmr/space .mrmr/views
git commit -m "chore: configure tutorial flow"
git status --short
```

`git status --short` must be empty before the run starts. `.mrmr/dev` remains
ignored and is never staged.

> **Apply while a run is active?** An apply replaces the whole space config at
> once, so the hub refuses it while any non-terminal run (`working` /
> `input-required`) is still using the current handlers — you get
> `409 SPACE_HAS_ACTIVE_RUNS` and the prior index is kept. Wait for the run to
> finish (or cancel it) and re-apply; no partial replacement is ever visible.
> See [Space handlers → Apply quiescence](../../space-handlers#apply-quiescence).

## Step 3 — Run the full pipeline

Same **`~/Documents/spec.md`** from Part 4. Desktop → **Run** → Submit.

```text
step.resolved(intake, continue)
  └─ step.opened(write_spec) → write_spec_copy
       └─ step.resolved(write_spec, completed)
            └─ step.opened(build) → dev_build
                 └─ murrmure_resolve_step(build, completed, { commit_message, description })
                      └─ step.opened(cleanup) → cleanup_archive_commit
                           └─ step.resolved(cleanup, completed)
                                └─ run.terminal(success)
```

Verify:

```bash
ls specs/archive/run_YOUR_RUN_ID.md
cat specs/archive/run_YOUR_RUN_ID.md
git log -1 --format=%B
ls .mrmr/dev/runs/run_YOUR_RUN_ID/steps/intake/spec/spec.md
```

You should see:

- Spec under **`specs/archive/{run_id}.md`** (not **`specs/current/`**)
- Git log subject and body matching the agent's **`build`** payload

Run scratch is under gitignored **`.mrmr/dev/runs/{run_id}/…`**.

### How this grows into the full tutorial

| This tutorial (v3) | Full preview-review tutorial |
|--------------------|------------------------------|
| Flat `build` (no review) | Nested `build-loop` + human **review** view |
| Shell cleanup (archive + commit) | Separate agent **archive** + **commit** handlers |
| Build prompt only | `agent.md` + feature-build skill |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `git commit` failed with empty `-m` | Missing build output binding / wrong token | Use <code v-pre>{{murrmure.step.build.output.commit_message}}</code> (not legacy <code v-pre>{{steps.build.output.commit_message}}</code>); ensure **`build`** resolved with those fields |
| `Unknown placeholder` at apply/spawn | Legacy or typo token | Prefer <code v-pre>{{murrmure.step.STEP_ID.output.FIELD}}</code>, <code v-pre>{{murrmure.step.STEP_ID.artifact.SLOT.path}}</code>, <code v-pre>{{murrmure.run_id}}</code> |
| `mv` failed | No `specs/current/spec.md` | Confirm **`write_spec`** ran in the same run |
| `git commit` failed (user/email) | Git not configured | `git init` (Part 1); set `user.name` / `user.email` |
| Wrong commit message | Stale run / wrong step output | Check journal: **`build`** resolve payload for this `run_id` |

## Checkpoint

- [ ] Manifest: full chain `intake` → `write_spec` → `build` → `cleanup`
- [ ] **`cleanup_archive_commit`** uses <code v-pre>{{murrmure.step.build.output.commit_message}}</code> and <code v-pre>{{murrmure.step.build.output.description}}</code> (unquoted)
- [ ] Spec archived; git log shows agent's commit subject + description

## Done

You wired the full pipeline: command copy, agent build (with resolve payload), command cleanup (archive + commit).

**Next paths:**

- **Archived v2 tutorial (non-normative)** — the original full preview review (nested build/review, agent archive); superseded and not in the active docs.
- [Space handlers](../../space-handlers) — handler reference
- [How it fits together](../../how-it-fits-together) — architecture map
