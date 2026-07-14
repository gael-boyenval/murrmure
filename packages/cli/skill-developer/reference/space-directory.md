# Space directory (`.mrmr/`)

Murrmure stores **protocol configuration** in `.mrmr/` at the project root. The hub indexes these files on apply — it does not read app source for orchestration config.

## Layout

```text
my-space/
  .mrmr/
    space/
      space.yaml              # optional slug hint; link.space_id after link
      handlers.yaml           # execution handlers (required for agent steps)
      bindings.yaml           # optional federation / worker bindings
      events.yaml             # optional emittable event catalog
    flows/{name}/flow.manifest.yaml
    views/{id}/view.manifest.yaml
    dev/contracts/contract-keys.json   # apply output — contract key catalog
```

Legacy `murrmure/` paths are accepted until HANDLER-CUTOVER but new spaces should use `.mrmr/`.

## Commands

| Command | Purpose |
|---------|---------|
| `mrmr setup` | Confirm one name/slug, create and link the Hub space, scaffold, and apply; creates no credential |
| `mrmr space init` | Scaffold empty `.mrmr/` templates |
| `mrmr space flow init <id> [--template hello-gate\|hello-invoke]` | Scaffold flow manifest + views |
| `mrmr space view init <id>` | Scaffold Vite+React view under `.mrmr/views/` |
| `mrmr view dev <id>` | Dev loop — Vite + fixture context |
| `mrmr space link --path . --space spc_…` | Register host path binding |
| `mrmr space link --path . --create` | Create hub space from slug, then link |
| `mrmr space apply [--strict]` | Validate local files and POST index apply |
| `mrmr space status` | Indexed counts and digests |
| `mrmr space doctor [--strict]` | Handler coverage, skill version, warnings |

## Workflow

```bash
mrmr space init
mrmr space flow init preview-review --template hello-gate
# edit handlers.yaml, flow manifest, views
mrmr space link --path . --space spc_ui_sandbox
mrmr space apply --strict
mrmr space status
```

Inside a `.mrmr/` repo, legacy `mrmr flow init` redirects to `mrmr space flow init` (exit 1).

## Migration from legacy layout

| Legacy | Current |
|--------|---------|
| `murrmure/actions.yaml` + `executors.yaml` | `.mrmr/space/handlers.yaml` |
| `murrmure/hooks.yaml` event chains | Event handlers in `handlers.yaml` (`on.event`) |
| `murrmure/` root | `.mrmr/` root |
| `invoke:` / `checkpoint:` step kinds | Resolver-agnostic step contracts (`branches`, `route`/`resume`) |
| Per-step `executor.action` | Handler `contract_keys` |
