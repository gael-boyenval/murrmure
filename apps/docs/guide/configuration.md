# Admin commands (CLI)

Team setup and administration happen through the **`mrmr` CLI**. There is no Configure UI — use these commands from a terminal while Murrmure Desktop (or your hub) is running.

Requires a token with **`space:admin`** scope. Desktop bootstrap token works for first-run setup; mint admin grants for ongoing ops.

## First-run setup

| Task | CLI |
|------|-----|
| Save hub credentials | `mrmr login --hub-url http://127.0.0.1:8787` |
| Initialize workspace | `mrmr space init` |
| Create hub space + link path | `mrmr space link --create` |
| Apply space index | `mrmr space apply` |
| Index a flow from `.mrmr/flows/` | `mrmr space apply` (see [Quick start](./quick-start)) |
| Mint agent grant | `mrmr grant mint --space spc_… --label "…" --capabilities flow:run,step:resolve,space:read` |

See [Quick start](./quick-start) for the full first-review path.

## Spaces

```bash
mrmr space list
mrmr space show spc_ui_sandbox
mrmr space create --slug my-space --name "My Space"
mrmr space link --path . --space spc_my_space
mrmr space update spc_… --install-policy authorized_agents
mrmr space archive spc_…
mrmr space status --space spc_…
mrmr space doctor --strict
```

| Field | Notes |
|-------|-------|
| Slug | Editable URL-safe name; the Hub assigns a separate immutable `spc_*` ID |
| Install policy | `human_only` \| `authorized_agents` \| `allow_list` |

## Flows

**v2 indexed flows** live in `.mrmr/flows/*/flow.manifest.yaml`:

```bash
mrmr space apply --strict
mrmr space status
mrmr flow run flw_flows_{name} --input '{}' --space spc_…
```

**Execution** lives in `.mrmr/space/handlers.yaml` — edit handlers, then re-apply. Event triggers use `on: event:` handlers or optional `mrmr space trigger register` templates.

See [Space handlers](./space-handlers) and [Creating flows](./creating-flows).

## Agent grants

```bash
mrmr grant list --space spc_ui_sandbox
mrmr grant mint --space spc_ui_sandbox \
  --label "Dev Cursor — ui-sandbox worker" \
  --harness cursor-local \
  --capabilities flow:run,step:resolve,space:read,journal:read \
  --expires-days 90
mrmr grant revoke --space spc_ui_sandbox grt_…
```

| Field | Notes |
|-------|-------|
| Label | Who this token is for |
| Harness | `cursor-local`, `ci`, … |
| Capabilities | Include `step:resolve` for agent-owned steps; `event:emit` for emit tools |

Export the **one-time token** as `MURRMURE_HUB_TOKEN` and run `mrmr grant use --space ...` to set your local active pointer.
Never commit live grant tokens (`tok_...`) to git; keep MCP config on env-variable references only.
If a token leaks or is committed, revoke the grant (`mrmr grant revoke --space spc_... grt_...`) and mint a replacement token.

## Members

```bash
mrmr space member list --space spc_ui_sandbox
mrmr space member invite --space spc_ui_sandbox --email dev@example.com --role editor
mrmr space member role --space spc_ui_sandbox mem_… --role admin
mrmr space member remove --space spc_ui_sandbox mem_…
```

Roles: **admin**, **editor**, **viewer**.

## Triggers

```bash
mrmr space trigger list --space spc_dev
mrmr space trigger deliveries --space spc_dev --limit 20
mrmr space trigger register --space spc_dev \
  --template spec-published-wake-dev \
  --source-space spc_orchestrator
mrmr space trigger test-fire --space spc_dev trg_…
mrmr space trigger disable --space spc_dev trg_…
mrmr space trigger templates --space spc_dev
mrmr space trigger event-catalog --space spc_dev
```

Bundled templates complement event handlers in `handlers.yaml`. Prefer handlers for space-local event → agent dispatch.

## Hub operator commands

For monorepo contributors running hub outside Desktop:

```bash
pnpm --filter @murrmure/hub-daemon start
mrmr hub federation
mrmr hub grants-export --out grants-audit.json
```

End users never run these — only contributors and operators hosting a standalone hub.

## Next

- [CLI reference](./cli) — full command tree
- [Shell UI routes](./shell-routes) — observer screens in Desktop
- [Connect your agent](./agents-mcp)
