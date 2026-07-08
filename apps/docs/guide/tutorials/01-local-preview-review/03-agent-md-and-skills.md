# Part 3 — Agent layer — `agent.md` and space skill

The **write / build / review / archive / commit** behavior is defined here — not in the flow YAML.

Murrmure **never reads** these files for configuration. Your **prompt triggers** (Part 4) tell Cursor to follow them.

## Two skill layers

| | Installed by | Teaches |
|---|--------------|---------|
| **Platform skill** | `mrmr skill install` | Murrmure hub tools, checkpoints, runs, `complete_action` |
| **Space skill** | You, in `skills/feature-build/` | This repo's build loop, preview discovery, archive rules |

## Step 1 — Create `agent.md`

At the space root:

```markdown
# Feature site agent

## Spec lifecycle
- **Intake:** human attaches markdown from their computer (not from this repo).
- **Write spec:** `feature_write_spec` writes to `specs/current/{spec_filename}`.
- **Archive:** after review validates, `feature_archive` moves `specs/current/` → `specs/archive/`.
- **Commit:** `feature_commit` stages and commits site changes.

## Build (feature_build) — mixed orchestration

One long Cursor session owns the review loop:

1. Read `specs/current/{spec_filename}`.
2. Implement the site; start or confirm the dev server.
3. Discover whatever local URL works (localhost, custom hostname, any port).
4. Call `murrmure_complete_action({ run_id, step_id: "build", result: { … } })`.
   Convention: include `preview_url`; any extra keys are fine (opaque step output bag).
5. Loop until human validates:
   - `murrmure_wait_for_gate({ run_id })`
   - If `changes_required` → fix site in this session, wait again
   - If `validated` → exit (flow continues to archive)
6. Do **not** call `murrmure_resolve_gate` for the human review path.

## Review

Humans use the **preview-review** view. The view reads `steps.build.output`.

## Archive / commit

Separate invoke steps after validation — do not combine in one action.
```

## Step 2 — Create space skill

```bash
mkdir -p skills/feature-build
```

`skills/feature-build/SKILL.md`:

```markdown
---
name: feature-build
description: Build site, report preview via murrmure_complete_action, run wait_for_gate review loop. Use when feature_build runs.
---

# Feature build (mixed orchestration)

Read `agent.md` first. Murrmure MCP must be connected.

## Build + review loop (same session)

1. Implement from `specs/current/{spec_filename}`.
2. Start dev server; note the working preview URL.
3. Advance flow to review (while shell action still running):

   murrmure_complete_action({
     run_id: "<from prompt>",
     step_id: "build",
     result: { preview_url: "http://your-local-url:3000" }
   })

4. murrmure_wait_for_gate({ run_id: "<from prompt>" })
5. On changes_required: read comments, fix locally, wait_for_gate again.
6. On validated: exit — flow runs archive then commit.

## Rules

- Never murrmure_resolve_gate for human review.
- Do not spawn a new cursor agent subprocess on feedback rounds.
- Use murrmure_get_run to read latest steps.review.output.
```

## Step 3 — Preview URL discovery (no hub config file)

The agent discovers preview locally:

- Read `package.json` scripts, start `npm run dev`, read terminal output or probe ports
- Report whatever URL works via **`murrmure_complete_action`** — not stdout JSON
- Step output is an **opaque bag**; the review view reads `steps.build.output.preview_url` (or any `http(s)` string value)

Cross-space preview (advanced): use **`query_ask`** to read typed data from another space — not a fixed `discover_preview` MCP tool.

## Step 4 — Why Murrmure stays out of this

| Murrmure indexes | Murrmure ignores |
|----------------|------------------|
| `murrmure/actions.yaml` prompts | `agent.md` content |
| Flow step ids | Skill prose |
| View bundles | Preview URL, git messages |

You can rewrite `agent.md` tomorrow without `mrmr space apply`. Change the flow graph only when **when** steps fire needs to change.

## Checkpoint

- [ ] `agent.md` describes write_spec, build loop, archive, commit
- [ ] `skills/feature-build/SKILL.md` documents `complete_action` + `wait_for_gate`
- [ ] No `preview.local.yaml` required

## Next

[Part 4 — Prompt triggers →](./04-prompt-triggers)
