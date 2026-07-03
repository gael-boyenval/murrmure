# Space directory (`murrmure/`)

Murrmure v2 stores **protocol configuration** in a `murrmure/` folder at the project root. The hub indexes these files on apply — it does not read `agent.md`, `.cursor/`, or app source for config.

## Layout

```text
my-space/
  murrmure/
    space.yaml              # optional slug hint for link
    actions.yaml
    executors.yaml
    hooks.yaml              # triggers.yaml accepted as alias
    flows/{name}/flow.manifest.yaml
    scripts/{name}-build.mjs
    views/{id}/view.manifest.yaml   # parsed at apply; not a hub entity
```

## Commands

| Command | Purpose |
|---------|---------|
| `mrmr space init` | Scaffold empty `murrmure/` templates |
| `mrmr space flow init <id> [--template hello-gate\|hello-invoke]` | Scaffold flow manifest, actions, scripts, and view packages (hello-gate) with per-file role comments |
| `mrmr space view init <id>` | Scaffold single Vite+React view under `murrmure/views/` |
| `mrmr view dev <id>` | Dev loop — author's Vite server + fixture context |
| `mrmr space link --path . --space spc_…` | Register host path binding on hub |
| `mrmr space link --path . --create` | Create hub space from `space.yaml` slug, then link (requires bootstrap/admin token with `space:admin`; scoped grants cannot link a newly created space) |
| `mrmr space apply` | Validate local files and POST index apply |
| `mrmr space status` | Show indexed counts and digests |

## Workflow

```bash
mrmr space init
mrmr space flow init preview-review --template hello-gate
# build views, edit actions/scripts as needed
mrmr space link --path . --space spc_ui_sandbox
mrmr space apply --strict
mrmr space status
```

Inside a `murrmure/` repo, legacy `mrmr flow init` redirects to `mrmr space flow init` (exit 1).

## Migration from v1

- `mrmr space trigger` → define hooks in `murrmure/hooks.yaml` and run `mrmr space apply`
- v2 flows in `murrmure/flows/` are indexed via apply only
