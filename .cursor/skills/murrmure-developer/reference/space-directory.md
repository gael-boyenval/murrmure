# Space directory (`.mrmr/`)

Murrmure stores **protocol configuration** in `.mrmr/` at the project root. The hub indexes these files on apply — it does not read app source for orchestration config.

## Layout

```text
my-space/
  .mrmr/
    space/
      space.yaml              # slug, name, description (purpose); link.space_id after link
      handlers.yaml           # execution handlers (required for agent steps)
      personas.yaml           # optional seat ads (handles + blurbs; not dispatch)
      bindings.yaml           # optional federation / worker bindings
      events.yaml             # optional emittable event catalog
    flows/{name}/flow.manifest.yaml
    views/{id}/view.manifest.yaml
    dev/contracts/contract-keys.json   # apply output — contract key catalog
```

`space.yaml` `description` is the space purpose (max 500 characters). Apply copies `name` and `description` onto the hub space; Shell space home shows it under the title.

Legacy `murrmure/` paths are removed — the handlers-only cutover is complete (Task 15); spaces use `.mrmr/` only.

## Commands

| Command | Purpose |
|---------|---------|
| `mrmr setup` | Confirm one name/slug, create and link the Hub space, scaffold, and apply; creates no credential |
| `mrmr space init` | Scaffold empty `.mrmr/` templates (`--description` writes purpose) |
| `mrmr space flow init <id> [--template hello-gate\|hello-invoke]` | Scaffold flow manifest + views |
| `mrmr space view init <id>` | Scaffold Vite+React view under `.mrmr/views/` |
| `mrmr view dev <id>` | Dev loop — Vite + fixture context |
| `mrmr space link --path . --space spc_…` | Register host path binding |
| `mrmr space link --path . --create` | Create hub space from slug, name, and description, then link |
| `mrmr space apply [--strict]` | Validate local files and POST index apply; copies `name` / `description` onto the hub space |
| `mrmr space status` | Indexed counts and digests |
| `mrmr space doctor [--strict]` | Handler coverage, skill version, warnings |
| `mrmr skill install --variant all` | Install murrmure-agent + murrmure-developer into `.cursor/skills/` |

Meeting seat: a space is not in a room until `.mrmr/space/handlers.yaml` has
`on.event` `mrmr.meeting.said` with **`type: shell_spawn`**. See
[meeting-seat.md](./meeting-seat.md).

Directive: a space is not eligible for header **New directive** until it binds
`step.opened::directive.execute`. Handler only — no local flow copy. See
[directive.md](./directive.md).

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
| legacy split action/executor indexes | `.mrmr/space/handlers.yaml` |
| legacy hook event chains | Event handlers in `handlers.yaml` (`on.event`) |
| `murrmure/` root | `.mrmr/` root |
| `invoke:` / `checkpoint:` step kinds | Resolver-agnostic step contracts (`branches`, `route`/`resume`) |
| Per-step indexed action binding | Handler `on::key` binding |
