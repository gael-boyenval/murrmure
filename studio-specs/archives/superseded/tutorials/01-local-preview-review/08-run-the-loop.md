# Part 8 — Run the loop

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

Handler **`feature_build`** receives the parent assignment:

1. It opens `build.build-loop` with **`murrmure_open_child_step`** and stops.
2. Handler **`feature_build_loop`** reads the spec, implements or revises the
   site, starts the preview, and resolves only `build.build-loop` with
   `{ preview_url: "…" }`.
3. A fresh `feature_build` assignment receives that `returned_child`, opens
   `build.review`, and stops.
4. The bound review View lets the human resolve the review child.

**Verify:** run detail alternates one `working` child with a `yielded` parent.
After each child resolves, only the parent is open with `reason: resumed`.

## Step 5 — Live review

Review view opens in ViewCanvasHost (step **`build.review`**).

- Check iframe shows updated site
- Either **Validate** or add notes → **Send feedback**

### Feedback round (optional)

If you sent feedback:

1. Parent receives `returned_child.branch: changes_required` and its comments.
2. Parent opens **`build.build-loop`** for the next iteration.
3. A fresh child assignment applies the feedback and resolves with a new URL.
4. Parent resumes and opens **`build.review`** again.

## Step 6 — Archive

After **Validate**, the parent resumes, consumes the accepted preview, and
resolves its own `completed` branch. The engine then opens **archive** and
dispatches **`feature_archive`**.

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
3. Parent build: open build-loop → yield
4. Build child: implement + resolve → parent resumes
5. Parent build: open review → yield
6. [optional] review feedback → parent resumes and opens build-loop again
7. Handler: feature_archive            (archive)
8. Handler: feature_commit             (commit)
9. Run complete
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
