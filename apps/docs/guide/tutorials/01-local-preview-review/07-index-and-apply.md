# Part 7 — Index and apply

Publish your local `murrmure/` tree to the hub so Desktop and Cursor see the flow, actions, and views.

## Step 1 — Link (if not done in setup)

```bash
cd ~/work/my-feature-site
mrmr space link --path . --space spc_…
```

Or `--create` on first link.

## Step 2 — Apply strict

```bash
mrmr space apply --strict
```

Strict mode fails on:

- Missing view `dist/` for referenced views
- Unknown action names in the manifest
- Invalid `on_resolve` routing

Fix errors, rebuild views if needed, re-run apply.

## Step 3 — Verify status

```bash
mrmr space status
```

Expect:

| Item | Name |
|------|------|
| Flow | `preview-review` |
| Views | `preview-review-intake`, `preview-review` |
| Actions | `feature_write_spec`, `feature_build`, `feature_archive`, `feature_commit` |

## Step 4 — Desktop smoke check

1. Open Murrmure Desktop → your space
2. Confirm **preview-review** appears with **Run**
3. Do not run yet — Part 8 walks through the full loop

## Step 5 — Agent smoke check

In Cursor:

> Call murrmure_space_status and list indexed flows.

Confirm **`murrmure_complete_action`** appears in the MCP catalog (requires `action:invoke` grant).

## What apply does not index

| Not indexed | Why |
|-------------|-----|
| `agent.md` | User-owned; read by agent via prompts |
| `skills/` | Same |
| `specs/current/`, `specs/archive/` | Runtime artifacts; created during runs |

## Checkpoint

- [ ] `mrmr space apply --strict` succeeds
- [ ] Status lists flow, four actions, two views
- [ ] Desktop shows **Run**

## Next

[Part 8 — Run the loop →](./08-run-the-loop)
