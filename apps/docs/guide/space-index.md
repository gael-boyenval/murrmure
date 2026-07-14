# Space index (`.mrmr/`)

Murrmure v2 stores **protocol configuration** in a `.mrmr/` directory at your project root. The hub indexes these files on apply — it does not read `agent.md`, `.cursor/`, or application source for config.

Use **Murrmure Desktop** to observe runs and gates; use **CLI** to init, link, and apply the index.

## Layout

```text
my-project/
  .mrmr/
    space/
      space.yaml              # slug hint for link --create; optional link.host override
      handlers.yaml           # step + event handlers (contract_keys)
      bindings.yaml           # optional — remote flow/view refs for worker spaces
    flows/
      my-flow/
        flow.manifest.yaml    # protocol: steps, branches, presentation
    views/
      my-view/
        view.manifest.yaml    # custom checkpoint UI (optional)
    dev/                      # local runtime outputs (gitignored)
      contract-keys.json      # codegen from apply (optional)
```

Legacy scaffold may still include empty `actions.yaml`, `executors.yaml`, `hooks.yaml` under `.mrmr/space/` — **new authoring uses `handlers.yaml`**. See [Space handlers](./space-handlers).

## Commands

| Command | Purpose |
|---------|---------|
| `mrmr space init` | Scaffold `.mrmr/` templates locally |
| `mrmr space link --path . --space spc_…` | Register `{ host, path, primary }` binding on hub |
| `mrmr space link --path . --create` | Create hub space from `space.yaml` slug, then link |
| `mrmr space apply` | Validate local YAML and POST index to hub |
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

Handlers match steps via **`contract_keys`** (`{flow_ref}.{qualified_step_id}`). Agents complete steps with **`murrmure_resolve_step`**; shell scripts may use **`mrmr step resolve`**.

List indexed handlers: MCP **`murrmure_list_handlers`** or `mrmr space doctor`.

## Flows and views

- **Flows** — `.mrmr/flows/*/flow.manifest.yaml` compiled to IR + StepContractCatalog on apply. Start from space home, event handlers, or `POST /v1/flows/{id}/run`.
- **Views** — optional custom checkpoint UI under `.mrmr/views/`. See [View SDK](../reference/view-sdk).

## Migration from v1 / `murrmure/`

| v1 / legacy | v2 |
|-------------|-----|
| legacy `murrmure/actions.yaml` + `hooks.yaml` | `.mrmr/space/handlers.yaml` |
| `executor.action` in flow manifest | `contract_keys` in handlers |
| `mrmr space trigger register` only | Event handlers in `handlers.yaml` + optional trigger templates |
| Instance-centric URLs | `/sessions/:id`, `/runs/:id` in Desktop shell |

## Next

- [Space handlers & contract keys](./space-handlers)
- [CLI](./cli) — full command reference
- [Connect your agent (MCP)](./agents-mcp)
- [HTTP API — space index](../reference/http-api#space-index)
