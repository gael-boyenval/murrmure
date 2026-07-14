# Part 4 — Run it and read what Murrmure did

**Concept:** A **run** is one execution of your flow. The hub **journal** records every open step, human resolve, and terminal outcome — the same audit trail Desktop, CLI, and agents read.

You run **`my-dev-flow` twice from Desktop**: first **Cancel** (failed run), then **Submit** with a real file (success). Then you verify the spec artifact landed in Murrmure's gitignored run directory.

## Before you start

Parts 1–3 must be done: space linked, flow + view applied.

```bash
cd ~/work/my-first-space
mrmr space apply
```

Create a spec file you will attach in the view — anywhere outside the repo is fine. For example in **Documents**:

```bash
mkdir -p ~/Documents
cat > ~/Documents/spec.md <<'EOF'
# My first spec

Attach this file in the intake view to complete the run.
EOF
```

Keep that path handy — you will use it again in [Part 5](./05-extend-flow-and-handlers).

## Step 1 — Open your space and start a run

In **Murrmure Desktop**:

1. Click your **space** in the sidebar (`my-first-space`)
2. Find flow **`my-dev-flow`**
3. Click **Run**

The hub creates a **session** (`ses_…`) and a **run** (`run_…`). The engine
opens generic step **`intake`**. Its `open_steps[]` projection identifies the
space-owned `view_resolver`, so Desktop loads **spec-intake** in the main canvas.

```text
flow.run.started
  └─ step.opened(intake)     resolver → intake_view → spec-intake
       └─ run remains open for resolution
```

## Step 2 — Cancel — run fails (on purpose)

In the intake view, click **Cancel** without choosing a file.

The view resolves branch **`cancel`**. Your manifest routes that branch to
`run: failed`, so the run ends as **failed**, not success.

**What you should see in Desktop:**

- Run status **failed** (or stopped — terminal failure)
- Step **`intake`** resolved on branch `cancel`
- No spec artifact for this run

```text
step.resolved(intake, cancel)
  └─ run.terminal(failed)
```

That is correct behavior: **Cancel** means “abort this run.”

::: info Retry is always a fresh check
A **failed/canceled run is terminal**, so it no longer counts against the flow's
concurrent-run capacity. You can start a new run immediately — admission
re-checks only **non-terminal** runs (`working` / `input-required`). Once
[Part 5](./05-extend-flow-and-handlers) caps `my-dev-flow` at
`max_concurrent_runs: 1`, a second **Run** while the first is still open would be
rejected with `409 FLOW_CONCURRENCY_LIMIT` (and the blocking run id); after the
first run terminates, the retry succeeds.
:::

## Step 3 — Run again and submit the spec

Start a **new** run the same way:

1. Space → **`my-dev-flow`** → **Run**
2. Intake view opens again (new `run_…`)

This time:

1. Choose **`~/Documents/spec.md`** (or wherever you saved it)
2. Click **Submit**

The view validates against the branch contract, shows aggregate upload progress,
and resolves **`continue`** with the **`spec`** artifact. **Cancel upload** is
available before resolve commit; it removes temporary bytes and leaves
`intake` open so you can retry. Once resolve has committed, a late cancel
reconciles to the successful result.

**What you should see in Desktop:**

- Run status **succeeded** / completed
- Step **`intake`** resolved on branch `continue`
- Run terminal — your flow has only **`intake`** (`continue` routes to `run: completed`)

```text
step.resolved(intake, continue)
  └─ artifacts: spec → stable path under run scratch
  └─ run.terminal(success)
```

## Step 4 — Verify the artifact on disk

Murrmure stores run scratch data under a **gitignored** tree in your space — not in git, not inline in the journal payload.

From your space root:

```bash
cd ~/work/my-first-space
ls .mrmr/dev/runs/
```

Pick the **successful** run id (the second run), then:

```bash
ls .mrmr/dev/runs/run_<id>/steps/intake/spec/
cat .mrmr/dev/runs/run_<id>/steps/intake/spec/spec.md
```

You should see your markdown bytes — the same content as `~/Documents/spec.md`. That path is the promoted **`artifact_slots.spec`** file for step `intake`.

::: info Path
Run scratch lives under gitignored **`.mrmr/dev/runs/{run_id}/…`**.
:::

## Step 5 — Read the internals (five-minute tour)

Open the **successful** run in Desktop (flowchart / journal) or ask your agent:

> Call `murrmure_get_run` for this run and summarize step statuses.

| Term | What you just saw |
|------|-------------------|
| **Session** | Container for the run's journal |
| **Run** | One walk through `intake` — you ran two (failed, then succeeded) |
| **Open step** | Waits for an authorized resolver; this space binds the intake View |
| **Branch** | `cancel` → run failed; `continue` → run completed + artifact |
| **Artifact** | Spec file bytes under `.mrmr/dev/runs/…/steps/intake/spec/` |
| **View** | Your custom UI in Desktop |
| **Journal** | Append-only log — Cancel and Submit both recorded |

Part 5 adds **command** and **agent** steps after intake; [Part 6](./06-cleanup-and-commit) finishes with **cleanup**.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Space empty / no flow | Not applied | `mrmr space apply --strict` |
| No **Run** on flow | Flow not indexed | Re-apply from space root |
| Blank intake view | View not built | `cd .mrmr/views/spec-intake && npm run build && mrmr space apply` |
| First run “failed” after Cancel | Expected | That is `route: { run: failed }` — start a new run for Submit |
| Submit errors in view | Contract validation | Fix file (required slot `spec`, max 1 MiB) before resolve |
| `CONTRACT_VALIDATION_FAILED` | File is missing, empty, wrong MIME/extension, or oversized | Read each field error; select a non-empty `.md`, `.markdown`, or `.txt` file up to 1 MiB |
| Upload cancelled | You clicked **Cancel upload** before commit | The step remains open; select or submit the file again |
| No file under `runs/…/spec/` | Wrong run id | Use the **successful** second run, not the cancelled one |

Full troubleshooting table: [Part 9 of the original tutorial](../01-local-preview-review/09-troubleshooting).

## Checkpoint

- [ ] Started **my-dev-flow** from Desktop (space → flow → **Run**)
- [ ] First run: **Cancel** → run shows **failed**
- [ ] Second run: attached **`~/Documents/spec.md`** → **Submit** → run **succeeded**
- [ ] `spec.md` visible under `.mrmr/…/runs/…/steps/intake/spec/`
- [ ] You can explain Cancel vs Submit branch outcomes

## Next

[Part 5 — Copy the spec and build →](./05-extend-flow-and-handlers)
