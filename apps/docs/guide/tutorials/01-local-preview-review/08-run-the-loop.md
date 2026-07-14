# Part 8 — Run the loop

::: warning Retired v2 handler model
This page references the **retired v2 handler model** (`kill_on: step.resolved`). Subprocess termination is now runtime-owned; authored `kill_on` is rejected. See **[Tutorial 1a (v3)](../01-local-preview-review-v3/)**.
:::

Walk through one full run: intake → write_spec → build (nested loop) → (optional feedback) → archive → commit.

Open the space in Cursor (`cursor .`). Keep `agent.md` and **`skills/feature-build/SKILL.md`** in mind — the build agent should follow them for the whole session.

## Step 1 — Start dev server (optional)

```bash
cd ~/work/my-feature-site
npm run dev
```

Or let the build agent start it.

## Step 2 — Intake

1. Desktop → space → **Run** **preview-review**
2. Intake view → choose `~/Documents/hero-section.md` (or your spec)
3. Enter reviewer email → **Start build**

**Verify:** run input contains `spec_filename`, `reviewer`. Spec bytes are a step artifact under `.mrmr/dev/runs/{run_id}/steps/intake/spec/` — not inline in the payload. Repo still has no `specs/` folder.

## Step 3 — Write spec

Engine opens **write_spec** → handler **`feature_write_spec`** dispatches on `step.opened`.

Agent should copy the intake artifact to `specs/current/hero-section.md`.

**Verify:**

```bash
ls specs/current/
cat specs/current/hero-section.md
```

Agent resolves with **`murrmure_resolve_step`** (`branch: "completed"`) or you can resolve from a script via **`mrmr step resolve --branch completed`**.

## Step 4 — Build + nested review loop

Handler **`feature_build`** dispatches once. The Cursor agent should:

1. Read `specs/current/hero-section.md`
2. Update `index.html`
3. Start or confirm dev server; discover local preview URL (e.g. `http://localhost:3000`)
4. Read **`active-step-contract.json`** — active step is **`build.build-loop`**
5. Call **`murrmure_resolve_step`** on **`build.build-loop`** with `branch: "completed"` and `{ preview_url: "…" }`
6. **Engine opens `build.review`** — agent does **not** resolve review
7. Call **`murrmure_wait_for_run`** — blocks until **`build.review`** is terminal

**Verify:** run detail shows `steps.build.build-loop.output.preview_url` and `build.review` status `awaiting_human` then terminal.

## Step 5 — Live review

Review view opens in ViewCanvasHost (step **`build.review`**).

- Check iframe shows updated site
- Either **Validate** or add notes → **Send feedback**

### Feedback round (optional)

If you sent feedback:

1. Agent receives `changes_required` + `comments` from **`build.review`** resolution
2. Agent fixes site **in the same session** — engine reopens **`build.build-loop`**
3. Agent resolves **`build.build-loop`** again with updated `preview_url`
4. Engine reopens **`build.review`**; agent waits again

The **build** handler subprocess stays alive until parent **build** resolves (`kill_on: step.resolved`).

## Step 6 — Archive

After **Validate**, parent **build** completes (`complete: parent`) and engine opens **archive** → handler **`feature_archive`** dispatches.

Agent should:

1. Move `specs/current/hero-section.md` → `specs/archive/hero-section.md`
2. Resolve **`archive`** with `{ archived_path: "specs/archive/hero-section.md" }`

**Verify:**

```bash
ls specs/current/    # empty or no hero file
ls specs/archive/    # hero-section.md present
```

## Step 7 — Commit

Handler **`feature_commit`** dispatches.

Agent should:

1. `git commit` all changes
2. Return JSON in step output, e.g.:

```json
{
  "commit_message": "feat: add hero section with CTA",
  "description": "Implemented hero block per specs/archive/hero-section.md."
}
```

**Verify:**

```bash
git log -1 --oneline
```

Run status: **completed**.

## Step 8 — Full timeline

```text
1. Human: pick spec from disk          (intake)
2. Handler: feature_write_spec         (write_spec)
3. Handler: feature_build — same session (build.build-loop resolve)
4. Engine: open build.review           (human iframe review)
5. [optional] feedback → agent fixes → resolve build-loop again
6. Handler: feature_archive            (archive)
7. Handler: feature_commit             (commit)
8. Run complete
```

## What you built

| Layer | You authored |
|-------|--------------|
| Protocol | Flow manifest + views (no `executor.action`) |
| Execution | `.mrmr/space/handlers.yaml` + `contract_keys` |
| Agent | `agent.md` + feature-build skill |
| Product | HTML site |

Murrmure coordinated **when**; handlers defined **what runs**; you defined **how**.

## Next

[Troubleshooting →](./09-troubleshooting) · [Tutorial 2](../02-multi-agent-brief/)
