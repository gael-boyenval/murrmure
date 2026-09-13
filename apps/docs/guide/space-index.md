# Space index (`.mrmr/`)

Murrmure v2 stores **protocol configuration** in a `.mrmr/` directory at your project root. The hub indexes these files on apply — it does not read `agent.md`, `.cursor/`, or application source for config.

Use **Murrmure Desktop** to observe runs and gates; use **CLI** to init, link, and apply the index.

## Layout

```text
my-project/
  .mrmr/
    space/
      space.yaml              # slug, name, description (purpose); link after link --create
      handlers.yaml           # step + event handlers (on::key binding; contract_keys is prompt-scope)
      personas.yaml           # optional — seat ads (handles + blurbs; not dispatch)
      bindings.yaml           # optional — remote flow/view refs for worker spaces
    flows/
      my-flow/
        flow.manifest.yaml    # protocol: steps, branches (no presentation field)
    views/
      my-view/
        view.manifest.yaml    # custom checkpoint UI (optional)
    dev/                      # local runtime outputs (gitignored)
      contract-keys.json      # codegen from apply (optional)
```

`space.yaml` may include `name`, `description` (purpose, max 500 characters), optional `memory_bank` (`^[a-z][a-z0-9-]{0,31}$`), optional `memory_tags` (inbound tag grant), optional `memory_subjects` (space-relative path to `subjects.yaml`, default `skills/memory-use/subjects.yaml` when the skill is installed), and optional `memory_readers` (space ids granted read-only access to this bank). `mrmr space apply` copies those fields onto the hub space; omitted `description` / `memory_bank` / `memory_tags` / `memory_subjects` clears the hub value and omitted `memory_readers` revokes memory bank grants this space issued. After apply, grant connection `memory:read` / `memory:write` so retain / recall appear on the Murrmure MCP connection. Cross-bank reads need a memory bank grant (`memory_readers` or `POST /v1/spaces/{id}/memory-bank-grants`); `murrmure_list_memory_banks` lists only banks the caller may read.

The handlers-only cutover is complete (Task 15): `mrmr space init` scaffolds only `space.yaml` + `handlers.yaml` under `.mrmr/space/` — no `actions.yaml`, `executors.yaml`, or `hooks.yaml`. Authoring uses `handlers.yaml` only. See [Space handlers](./space-handlers).

## Commands

| Command | Purpose |
|---------|---------|
| `mrmr space init` | Scaffold `.mrmr/` templates locally (`--description` writes purpose) |
| `mrmr space link --path . --space spc_…` | Register `{ host, path, primary }` binding on hub |
| `mrmr space link --path . --create` | Create hub space from `space.yaml` slug, name, and description, then link |
| `mrmr space apply` | Validate local YAML and POST index to hub; copies `name` / `description` / optional `memory_bank` / `memory_tags` / `memory_subjects` / `memory_readers` onto the hub space |
| `mrmr space status` | Show indexed counts and digests |
| `mrmr flow run <flow_id>` | Start an indexed flow manually |
| `mrmr step resolve` | Resolve current step from shell env (handler `complete: cli`) |

## Typical workflow

```bash
mrmr space init
# edit .mrmr/space/handlers.yaml, .mrmr/flows/, optional views/
mrmr space link --path . --create    # or --space spc_existing
mrmr space apply --strict
mrmr space status
mrmr connection create --space spc_…
```

After apply, the space appears in Desktop when the actor has `space:read`. Bindings store the filesystem path on the space record — **path is never the space id**.

## Handlers (execution)

| File | Indexed as | Runtime |
|------|------------|---------|
| `handlers.yaml` | Step + event handlers | Dispatched on `step.opened` / journal events |

Handlers bind steps via **`on: step.opened::{flow_name}.{qualified_step_id}`** (the `on::key` binding); **`contract_keys`** is **prompt-scope only** (`{flow_ref}.{qualified_step_id}`), not the binding key. Agents complete steps with **`murrmure_resolve_step`**; shell scripts may use **`mrmr step resolve`**.

List indexed handlers: MCP **`murrmure_list_handlers`** or `mrmr space doctor`.

## Flows and views

- **Flows** — `.mrmr/flows/*/flow.manifest.yaml` compiled to IR + StepContractCatalog on apply. Start from space home, event handlers, or `POST /v1/flows/{id}/run`.
- **Views** — optional custom checkpoint UI under `.mrmr/views/`. See [View SDK](../reference/view-sdk).

## Migration from v1 / `murrmure/`

| v1 / legacy | v2 |
|-------------|-----|
| legacy split action/hook indexes | `.mrmr/space/handlers.yaml` |
| indexed action binding in flow manifest | `on::key` binding in `handlers.yaml` (`contract_keys` is prompt-scope) |
| `mrmr space trigger register` only | Event handlers in `handlers.yaml` + optional trigger templates |
| Instance-centric URLs | `/sessions/:id`, `/runs/:id` in Desktop shell |

## Next

- [Space handlers & contract keys](./space-handlers)
- [CLI](./cli) — full command reference
- [Connect your agent (MCP)](./agents-mcp)
- [HTTP API — space index](../reference/http-api#space-index)
