# Part 8 — Run the loop

Walk through one full run: intake → write_spec → build (agent loop) → review → (optional feedback) → archive → commit.

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

**Verify:** run input contains `spec_markdown`, `spec_filename`, `reviewer`. Repo still has no `specs/` folder.

## Step 3 — Write spec

Flow invokes **`feature_write_spec`**.

Agent should create `specs/current/hero-section.md` with attached content.

**Verify:**

```bash
ls specs/current/
cat specs/current/hero-section.md
```

## Step 4 — Build + review loop

Flow invokes **`feature_build`** once. The Cursor agent should:

1. Read `specs/current/hero-section.md`
2. Update `index.html`
3. Start or confirm dev server; discover local preview URL (e.g. `http://localhost:3000`)
4. Call **`murrmure_complete_action`** with `{ preview_url: "…" }` → flow advances to **review**
5. Call **`murrmure_wait_for_gate`** — blocks until you act in the review view

**Verify:** run detail shows `steps.build.output.preview_url`.

## Step 5 — Live review

Review view opens in ViewCanvasHost.

- Check iframe shows updated site
- Either **Validate** or add notes → **Send feedback**

### Feedback round (optional)

If you sent feedback:

1. Agent receives `changes_required` + `comments` from gate resolution
2. Agent fixes site **in the same session** — flow reopens **review**, does **not** re-invoke **build**
3. Agent calls **`murrmure_wait_for_gate`** again
4. Review view opens again with updated preview (hot reload)

## Step 6 — Archive

After **Validate**, flow invokes **`feature_archive`**.

Agent should:

1. Move `specs/current/hero-section.md` → `specs/archive/hero-section.md`
2. Return `{ "archived_path": "specs/archive/hero-section.md" }`

**Verify:**

```bash
ls specs/current/    # empty or no hero file
ls specs/archive/    # hero-section.md present
```

## Step 7 — Commit

Flow invokes **`feature_commit`**.

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
2. Agent: write specs/current/         (feature_write_spec)
3. Agent: code + complete_action       (feature_build — same session)
4. Human: iframe review                (review)
5. [optional] feedback → agent fixes → wait_for_gate again (still build session)
6. Agent: current → archive            (feature_archive)
7. Agent: git commit + summary         (feature_commit)
8. Run complete
```

## What you built

| Layer | You authored |
|-------|--------------|
| Protocol | Flow manifest + views + action names |
| Agent | `agent.md` + feature-build skill + prompt triggers |
| Product | HTML site |

Murrmure coordinated **when**; you defined **how**.

Reference implementation: [`examples/flows/preview-review-v2/`](../../../../examples/flows/preview-review-v2/).

## Next

[Troubleshooting →](./09-troubleshooting) · [Tutorial 2](../02-multi-agent-brief/)
