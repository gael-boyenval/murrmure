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

`write_spec` is the first repository-mutating handler, so update its command to
fail before mutation when the repository already has staged, unstaged, or
non-ignored untracked changes:

```diff
     command: |
+      git diff --quiet
+      git diff --cached --quiet
+      test -z "$(git ls-files --others --exclude-standard)"
       mkdir -p specs/current
       cp {{murrmure.step.intake.artifact.spec.path}} specs/current/spec.md
```

Create `.mrmr/space/scripts/cleanup.mjs`. It checks the run ID and commit
message, archives to `specs/archive/{run_id}.md`, rejects changed paths outside
the tutorial allowlist, stages only accepted paths, and prints structured output:

<!-- tutorial-v3-fence:part-6-cleanup-script -->
```javascript
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

const [runId, subject, description] = process.argv.slice(2);
if (!/^run_[A-Za-z0-9]+$/.test(runId ?? "")) throw new Error("invalid run id");
if (!subject?.trim() || /[\r\n]/.test(subject)) throw new Error("invalid commit subject");
if (!description?.trim()) throw new Error("invalid commit description");

const archive = join("specs", "archive", `${runId}.md`);
if (existsSync(archive)) throw new Error(`archive already exists: ${archive}`);
mkdirSync(dirname(archive), { recursive: true });
renameSync(join("specs", "current", "spec.md"), archive);

const status = execFileSync("git", ["status", "--porcelain", "-z"], { encoding: "utf8" });
const changed = status.split("\0").filter(Boolean).map((entry) => entry.slice(3));
const allowed = changed.filter((path) =>
  path === archive ||
  path === "package.json" ||
  path === "pnpm-lock.yaml" ||
  path.startsWith("src/") ||
  path.startsWith("test/") ||
  path.startsWith("tests/")
);
const rejected = changed.filter((path) => path !== "specs/current/spec.md" && !allowed.includes(path));
if (rejected.length > 0) throw new Error(`workflow does not own changed paths: ${rejected.join(", ")}`);
if (allowed.length === 0) throw new Error("no workflow-owned outputs to commit");

execFileSync("git", ["add", "--", ...allowed], { stdio: "inherit" });
execFileSync("git", ["commit", "-m", subject, "-m", description], { stdio: "inherit" });
const commitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
process.stdout.write(`${JSON.stringify({ commit_sha: commitSha, staged_paths: allowed, archive_path: archive })}\n`);
```

Append this handler to `.mrmr/space/handlers.yaml`:

<!-- tutorial-v3-fence:part-6-cleanup-handler -->
```yaml
  - id: cleanup_archive_commit
    on: step.opened::my-dev-flow.cleanup
    type: shell_spawn
    complete: auto
    command: node .mrmr/space/scripts/cleanup.mjs {{murrmure.run.id}} {{steps.build.output.commit_message}} {{steps.build.output.description}}
    timeout_ms: 10000
```

### What each piece does

| Piece | Role |
|-------|------|
| **`cleanup.mjs`** | Checks the changed-path allowlist, archives the spec under this run ID, stages only owned outputs, and commits. |
| **`steps.build.output.commit_message`** | Subject line the agent passed on **`build`** resolve — from [Part 5](./05-extend-flow-and-handlers). Token form: <code v-pre>{{steps.build.output.commit_message}}</code> |
| **`steps.build.output.description`** | Body line from the same resolve payload. Token form: <code v-pre>{{steps.build.output.description}}</code> |
| **`complete: auto`** | The script exits 0 → hub resolves **`cleanup`** on **`completed`** and journals its structured output. |

Handlers read prior step output through <code v-pre>{{steps.{step_id}.output.{field}}}</code> tokens — here, fields from **`build`**'s resolve payload.

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
ls specs/archive/run_<id>.md
cat specs/archive/run_<id>.md
git log -1 --format=%B
ls .mrmr/dev/runs/run_<id>/steps/intake/spec/spec.md
```

You should see:

- Spec under **`specs/archive/{run_id}.md`** (not **`specs/current/`**)
- Git log subject and body matching the agent's **`build`** payload
- The cleanup journal output includes `commit_sha`, `staged_paths`, and `archive_path`

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
