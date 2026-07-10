# Part 3 — Run it and read what Murrmure did

**Concept:** A **run** is one execution of your flow. The hub **journal** records every step open, handler dispatch, and resolve — the audit trail humans and agents share.

You start the run, watch each handoff, then peek under the hood.

## Before you start

```bash
cd ~/work/my-first-space
# open the project in your IDE — the handler will spawn an agent from here
```

Keep your spec file ready (`~/Documents/feature-spec.md` or similar).

## Step 1 — Start the run (human entry)

1. Murrmure Desktop → your space → **Run** on **preview-review-mini**
2. The shell creates a **session** (`ses_…`) and a **run** (`run_…`)
3. Engine opens step **`intake`** → status `input-required` / `awaiting_human`
4. **ViewCanvasHost** loads **spec-intake** — this is the primary human surface, not shell admin forms

**What the hub just did:**

```text
flow.run.started
  └─ step.opened(intake)     presentation → spec-intake view
       └─ run paused for human input
```

## Step 2 — Intake resolve (human → protocol)

In the intake view:

1. Choose your spec file
2. Confirm filename (e.g. `feature-spec.md`)
3. Click **Continue**

The view uploads the file to the step workdir and resolves branch **`continue`**.

**Verify on disk** (paths vary by run id):

```bash
ls .mrmr/dev/runs/
# pick your run_id
ls .mrmr/dev/runs/run_…/steps/intake/spec/
```

The spec bytes live under **`steps/intake/spec/`** — not in git, not inline in the resolve payload. That is **`artifact_slots`** in action.

**Journal beats:**

```text
step.resolved(intake, continue)
  └─ payload: { spec_filename }
  └─ artifacts: spec → workdir path
step.opened(write_spec)
```

Run input now carries `spec_filename` for downstream template params (`{{input.spec_filename}}`).

## Step 3 — Handler dispatch (protocol → agent)

Engine opens **`write_spec`** (`role: agent`). Hub matches handler **`mini_write_spec`**:

| Match rule | Value |
|------------|-------|
| Event | `step.opened` |
| Contract key | `preview-review-mini.write_spec` |
| Handler | `mini_write_spec` → `shell_spawn` |

Your agent starts with the handler prompt. It should:

1. Read `{{murrmure.step.intake.artifact.spec.path}}` (injected as a real path)
2. Create `specs/current/feature-spec.md` in the repo
3. Call **`murrmure_resolve_step`** with `branch: "completed"`

**Verify in the repo:**

```bash
ls specs/current/
cat specs/current/feature-spec.md
```

If the agent stalls, nudge it in your agent chat:

> The `write_spec` step is open. Copy the intake artifact to `specs/current/{{spec_filename}}` and call `murrmure_resolve_step` with branch `completed`.

Or resolve manually from the shell (same hub API):

```bash
mrmr step resolve --run run_… --step write_spec --branch completed
```

## Step 4 — Run completes (agent → done)

When **`write_spec`** resolves `completed` with `next: null`, the run becomes **terminal**.

Desktop should show the run as succeeded. No build step, no review gate — intentionally minimal.

```text
step.resolved(write_spec, completed)
  └─ run.terminal(success)
```

## Step 5 — Read the internals (five-minute tour)

Open the run in Desktop (flowchart / journal) or ask your agent:

> Call `murrmure_get_run` for this run and summarize step statuses and handler journal entries.

| Term | What you just saw |
|------|-------------------|
| **Session** | Container for human-visible title + correlated journal |
| **Run** | One walk through `intake` → `write_spec` |
| **Step contract** | Manifest entry: branches, schemas, `next` / `fail_run` |
| **Human step** | Pauses run; view calls resolve |
| **Agent step** | Handler spawns work; agent must resolve explicitly |
| **Artifact** | Large file stored in step workdir, referenced by path in prompts |
| **Contract key** | `flow_ref.step_id` linking manifest step to handler |
| **Journal** | Append-only event log — same truth for Desktop, CLI, MCP |

### How this grows into the full tutorial

| Mini flow (now) | Full preview-review tutorial |
|-----------------|------------------------------|
| `write_spec` ends run | `write_spec` → `build` (nested loop + review view) |
| One handler | Four handlers + `agent.md` + feature-build skill |
| Single artifact handoff | Preview URL in step output → iframe in review view |
| 3 parts | 9 parts — same hub mechanics, richer graph |

Continue with [Tutorial 1 — Full walkthrough](../01-local-preview-review/) when you want build → live review → archive → commit.

## Troubleshooting (mini flow)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| No **Run** button | Flow not indexed | `mrmr space apply --strict` |
| Blank intake view | View not built | `cd .mrmr/views/spec-intake && npm run build` |
| `HANDLER_MISSING` on apply | Key mismatch | Handler must list `preview-review-mini.write_spec` |
| Agent step open, nothing runs | MCP / grant | Grant needs `action:invoke`; reload your agent's MCP config |
| Agent never resolves | `complete: explicit` | Agent must call `murrmure_resolve_step` |
| `specs/current/` empty | Handler did not run | Check handler journal; read artifact path in prompt |

Full troubleshooting table: [Part 9 of the original tutorial](../01-local-preview-review/09-troubleshooting).

## Checkpoint

- [ ] Run started from Desktop; intake view opened in ViewCanvasHost
- [ ] Spec artifact visible under `.mrmr/dev/runs/…/steps/intake/spec/`
- [ ] `specs/current/{filename}` created in repo
- [ ] Run ended successfully after `write_spec` resolved
- [ ] You can explain flow vs handler vs view in one sentence each

## Done

You launched Murrmure, created a space, authored a two-step flow, and traced a full run through the journal.

**Next paths:**

- [Tutorial 1 — Full preview review](../01-local-preview-review/) — add build, review loop, archive, commit
- [How it fits together](../../how-it-fits-together) — hub, grants, federation
- [Creating flows](../../creating-flows) — authoring index
