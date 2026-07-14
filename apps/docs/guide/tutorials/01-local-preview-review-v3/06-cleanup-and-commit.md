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

## Step 2 — Handler: archive and commit

Append to `.mrmr/space/handlers.yaml`:

```diff
   - id: dev_build
     on: step.opened::my-dev-flow.build
     ...
+
+  - id: cleanup_archive_commit
+    on: step.opened::my-dev-flow.cleanup
+    type: shell_spawn
+    complete: auto
+    command: |
+      mkdir -p specs/archive
+      mv specs/current/spec.md specs/archive/spec.md
+      git add -A
+      git commit -m "{{steps.build.output.commit_message}}" -m "{{steps.build.output.description}}"
+    timeout_ms: 10000
```

### What each piece does

| Piece | Role |
|-------|------|
| **`mv … specs/archive/`** | Moves the spec out of **`current`** — same pattern as the [full tutorial](../01-local-preview-review/08-run-the-loop) **archive** step, but one shell handler instead of an agent. |
| **`steps.build.output.commit_message`** | Subject line the agent passed on **`build`** resolve — from [Part 5](./05-extend-flow-and-handlers). Token form: <code v-pre>{{steps.build.output.commit_message}}</code> |
| **`steps.build.output.description`** | Body line from the same resolve payload. Token form: <code v-pre>{{steps.build.output.description}}</code> |
| **`complete: auto`** | `git commit` exits 0 → hub resolves **`cleanup`** on **`completed`**. |

Handlers read prior step output through <code v-pre>{{steps.{step_id}.output.{field}}}</code> tokens — here, fields from **`build`**'s resolve payload.

Re-apply:

```bash
cd ~/work/my-first-space
mrmr space apply --strict
```

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
ls specs/archive/spec.md
cat specs/archive/spec.md
git log -1 --format=%B
ls .mrmr/dev/runs/run_<id>/steps/intake/spec/spec.md
```

You should see:

- Spec under **`specs/archive/`** (not **`specs/current/`**)
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
| `git commit` failed with empty `-m` | Build resolve missing payload | Re-run; ensure Part 5 agent passes `commit_message` + `description` |
| `mv` failed | No `specs/current/spec.md` | Confirm **`write_spec`** ran in the same run |
| `git commit` failed (user/email) | Git not configured | `git init` (Part 1); set `user.name` / `user.email` |
| Wrong commit message | Stale run / wrong step output | Check journal: **`build`** resolve payload for this `run_id` |

## Checkpoint

- [ ] Manifest: full chain `intake` → `write_spec` → `build` → `cleanup`
- [ ] **`cleanup_archive_commit`** uses <code v-pre>{{steps.build.output.commit_message}}</code> and <code v-pre>{{steps.build.output.description}}</code>
- [ ] Spec archived; git log shows agent's commit subject + description

## Done

You wired the full pipeline: command copy, agent build (with resolve payload), command cleanup (archive + commit).

**Next paths:**

- [Tutorial 1 — Full preview review](../01-local-preview-review/) — nested build/review, agent archive
- [Space handlers](../../space-handlers) — handler reference
- [How it fits together](../../how-it-fits-together) — architecture map
