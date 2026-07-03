# Space index (`murrmure/`)

Murrmure v2 stores **protocol configuration** in a `murrmure/` folder at your project root. The hub indexes these files on apply — it does not read `agent.md`, `.cursor/`, or application source for config.

Use **Murrmure Desktop** to observe runs and gates; use **CLI** to init, link, and apply the index.

## Layout

```text
my-project/
  murrmure/
    space.yaml              # optional slug hint for link --create
    actions.yaml            # indexed actions (invoke targets)
    executors.yaml          # executor bindings (local, remote_hub, queue_poll, …)
    hooks.yaml              # event → action chains (triggers.yaml accepted as alias)
    flows/
      my-flow/
        flow.manifest.yaml  # flow IR, start conditions, MCP tool names
    views/
      my-view/
        view.manifest.yaml  # custom start UI (optional; not a hub entity)
```

## Commands

| Command | Purpose |
|---------|---------|
| `mrmr space init` | Scaffold `murrmure/` templates locally |
| `mrmr space link --path . --space spc_…` | Register `{ host, path, primary }` binding on hub |
| `mrmr space link --path . --create` | Create hub space from `space.yaml` slug, then link |
| `mrmr space apply` | Validate local YAML and POST index to hub |
| `mrmr space status` | Show indexed counts and digests |
| `mrmr action invoke <name>` | Invoke an indexed action |
| `mrmr flow run <flow_id>` | Start an indexed flow manually |

## Typical workflow

```bash
mrmr space init
# edit murrmure/actions.yaml, flows/, hooks.yaml
mrmr space link --path . --create    # or --space spc_existing
mrmr space apply
mrmr space status
mrmr grant mint --label "dev agent" --capabilities flow:run,action:invoke,space:read
```

After apply, the space appears in Desktop when the actor has `space:read`. Bindings store the filesystem path on the space record — **path is never the space id**.

## Actions, executors, hooks

| File | Indexed as | HTTP |
|------|------------|------|
| `actions.yaml` | Named invoke targets | `POST /v1/spaces/{id}/actions/{name}/invoke` |
| `executors.yaml` | Executor bindings | `GET /v1/spaces/{id}/executors` |
| `hooks.yaml` | Event → action chains | Fired on journal events after apply |

Agents invoke actions via MCP **`murrmure_invoke_action`** or CLI **`mrmr action invoke`**. External workers poll **`GET /v1/executor/tasks`** — see [Workers](../reference/http-api#executor-queue-poll).

## Flows and views

- **Flows** — `murrmure/flows/*/flow.manifest.yaml` compiled to IR on apply. Start manually from space home, hooks, or `POST /v1/flows/{id}/run`.
- **Views** — optional custom start UI under `murrmure/views/`. See [View SDK](../reference/view-sdk).

## Migration from v1

| v1 | v2 |
|----|-----|
| `mrmr space trigger register` | Define hooks in `murrmure/hooks.yaml` + apply |
| Instance-centric URLs | `/sessions/:id`, `/runs/:id` in Desktop shell |
| Worker bundle install | `murrmure/flows/` + `mrmr space apply` |

## Next

- [CLI](./cli) — full command reference
- [Connect your agent (MCP)](./agents-mcp)
- [HTTP API — space index](../reference/http-api#space-index)
