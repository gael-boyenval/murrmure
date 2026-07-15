# Part 7 — Index and apply

Publish your local `.mrmr/` tree to the hub so Desktop and Cursor see the flow, handlers, and views.

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
- **`HANDLER_MISSING`** / **`STEP_UNCOVERED`** — agent step with no matching handler `contract_keys`
- Invalid branch routing in the manifest
- **`executor.action`** in flow manifests (banned — use handlers instead)

Fix errors, rebuild views if needed, re-run apply.

Apply also writes **`.mrmr/dev/contracts/contract-keys.json`** — use it to verify handler coverage (Part 4).

## Step 3 — Doctor (handler coverage)

```bash
mrmr space doctor
```

| Code | Severity | Fix |
|------|----------|-----|
| `HANDLER_MISSING` / `STEP_UNCOVERED` | warning (error in strict) | Add handler with matching `contract_keys` from `contract-keys.json` |
| `HANDLER_ORPHAN_KEY` | warning | Remove unused key or add a manifest step |
| `HANDLER_KEY_CONFLICT` | error | Two handlers claim the same key — dedupe |
| `HANDLER_LEGACY_ACTIONS` | warning | Migrate `actions.yaml` triggers to `handlers.yaml` |

When strict apply passes with zero handler warnings, your bundle matches the tutorial shape.

## Step 4 — Verify status

```bash
mrmr space status
```

Expect:

| Item | Name |
|------|------|
| Flow | `preview-review` |
| Views | `preview-review-intake`, `preview-review` |
| Handlers | `feature_write_spec`, `feature_build`, `feature_archive`, `feature_commit` |

## Step 5 — Desktop smoke check

1. Open Murrmure Desktop → your space
2. Confirm **preview-review** appears with **Run**
3. Do not run yet — Part 8 walks through the full loop

## Step 6 — Agent smoke check

In Cursor:

> Call murrmure_space_status and list indexed flows.

Confirm **`murrmure_resolve_step`** appears in the MCP catalog (requires `step:resolve` grant). Optional: **`murrmure_list_handlers`** to see indexed handlers.

## What apply does not index

| Not indexed | Why |
|-------------|-----|
| `agent.md` | User-owned; read by agent via handler prompts |
| `skills/` | Same |
| `specs/current/`, `specs/archive/` | Runtime artifacts; created during runs |

## Checkpoint

- [ ] `mrmr space apply --strict` succeeds
- [ ] `mrmr space doctor` shows no handler coverage errors
- [ ] Status lists flow, four handlers, two views
- [ ] Desktop shows **Run**

## Next

[Part 8 — Run the loop →](./08-run-the-loop)
