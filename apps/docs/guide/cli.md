# CLI

**Optional** — for CI, scripts, and operators who prefer the terminal. Interactive agent work uses **[MCP](./agents-mcp)**; admin setup uses **`mrmr`** and **[Murrmure Desktop](./desktop)**.

The Murrmure CLI (`@murrmure/cli`, binaries `mrmr` / `murrmure`) talks to your local hub (default `http://127.0.0.1:8787` when Desktop is running):

```bash
npm install -g @murrmure/cli
```

## Output modes

**Human text is the default** on stdout — tables, checkmarks, and short summaries for day-to-day use.

Use **`--json`** when scripting or piping into `jq`:

```bash
mrmr whoami --json
mrmr flow validate . --json
```

Diagnostics and hints go to **stderr** via consola. Exit codes: `0` success, `1` operational error, `2` usage.

## Global flags

Authenticated commands accept:

```bash
mrmr --space spc_ui_sandbox --hub-url http://127.0.0.1:8787 --token tok_… <command>
```

Resolution order: flags → env vars → `~/.murrmure/credentials` → `~/.murrmure/hubs/shared.json`.

## Command tree

Run `mrmr --help` for the full tree. Top-level groups:

| Group | Purpose |
|-------|---------|
| `login`, `logout`, `whoami` | Save and inspect hub credentials |
| `doctor` | Hub, auth, and scope diagnostics |
| `health` | Unauthenticated hub health check |
| `space` | Spaces, grants, members, triggers, index apply |
| `action` | Invoke indexed actions |
| `me` | User preferences (landing space) |
| `worker` | External queue_poll worker helpers |
| `federation` | Federation peer management |
| `hub` | Operator exports |
| `runtime` | Events, gates, waits, audit |
| `flow` | Indexed `flow run` + local validate helpers |
| `view` | Scaffold custom view packages |
| `setup` | First-run wizard (`mrmr setup`, `mrmr space onboard`) |
| `skill` | Install/update the **murrmure** agent skill |

**MCP:** use `murrmure-mcp` from `@murrmure/mcp-bridge` with thin config (`command: "murrmure-mcp"` + `MURRMURE_HUB_TOKEN` env ref). See [Connect your agent](./agents-mcp).

## Doctor

Diagnose auth, hub reachability, and scope gaps before pushing flows:

```bash
mrmr doctor
mrmr doctor --json
```

Human output includes auth source, hub status, per-space scopes, and capability summary (push flows / mint grants / register triggers). JSON shape: `{ ok, issues, profile }`.

> `mrmr flow doctor` is deprecated — it prints a stderr hint and delegates to `mrmr doctor`.

## Login

Save hub URL and bearer token locally (interactive prompts; optional `--open` to open Desktop at `/spaces/new`):

```bash
mrmr login
mrmr login --hub-url http://127.0.0.1:8787 --open
```

Check identity and scopes:

```bash
mrmr whoami
mrmr whoami --json
```

Remove saved credentials (env vars are unchanged):

```bash
mrmr logout
mrmr logout --yes
```

Activate a stored per-space grant token for local CLI auth resolution:

```bash
mrmr grant use --space spc_ui_sandbox
```

## Environment (CI / scripts)

```bash
export MURRMURE_HUB_URL=http://127.0.0.1:8787
export MURRMURE_HUB_TOKEN=tok_your_grant_token
export MURRMURE_SPACE_ID=spc_your_space_id
mrmr grant use --space spc_your_space_id   # optional local active-pointer switch
```

## Indexed flows (v2)

Scaffold and index workflows in `murrmure/`:

```bash
mrmr space init
# Author murrmure/flows/preview-review/flow.manifest.yaml + actions — see Tutorial 1
mrmr space apply --strict
mrmr flow run flw_flows_preview_review --input '{}' --space spc_ui_sandbox
```

`--strict` fails on lint errors including **`LEGACY_STEP_KIND`** — manifests with `invoke:` / `checkpoint:` / `gate:` top-level steps are rejected. Migrate to unified step contracts ([bridge](../../studio-specs/current/bridges/step-contract.md)).

See [Flows tutorial](./flows-tutorial) and [Creating flows](./creating-flows).

**Agent skill** (optional):

```bash
mrmr skill install
mrmr skill update
```

See [Agent skill](./agent-skill).

All `mrmr space`, `mrmr flow run`, and `mrmr skill` subcommands support `--json` for scripts.

---

## Platform CLI commands

Runtime commands live under **`mrmr runtime`** (not flat top-level names). Each requires a **valid token for the target space** (`--space` or `MURRMURE_SPACE_ID`); typical grant scopes are advisory — the hub gates these routes with token-for-space only.

### `mrmr health`

```bash
mrmr health
```

Service status and API version (no auth).

### `mrmr runtime events`

```bash
mrmr runtime events --space spc_abc123
mrmr runtime events --space spc_abc123 42
```

Tail journal events for a space. Typical grant scope: `event:read`.

### `mrmr runtime gates`

```bash
mrmr runtime gates --space spc_abc123
```

List pending human gates. Typical grant scope: `space:read`.

### `mrmr runtime transition` (removed)

::: warning Removed in v2
The CLI subcommand still exists but calls **`POST /v1/spaces/{id}/instances/{id}/transitions`**, which returns **404** — the instances API was removed with the v1 instance model. Use mount-scoped MCP tools (e.g. **`transition_spec`**, **`transition_brief`**) or session/run APIs instead.
:::

### `mrmr runtime wait`

```bash
mrmr runtime wait --space spc_abc123 wait_abc --timeout 120000
```

Poll until a registered wait resolves. Typical grant scope: `state:transition`.

### `mrmr runtime audit export`

Download audit JSONL to stdout (always raw JSONL, even without `--json`).

```bash
mrmr runtime audit export --space spc_abc123 0 > audit.jsonl
```

### `mrmr space`

Space administration — create and manage spaces from the terminal. Requires **`space:admin`** for mutating commands (bootstrap token works on an empty hub).

```bash
mrmr space init
mrmr space list
mrmr space show spc_ui_sandbox
mrmr space create --slug ui-sandbox --name "UI Sandbox"
mrmr space update spc_ui_sandbox --name "Sandbox"
mrmr space archive spc_ui_sandbox
```

| Command | Requires | HTTP |
|---------|----------|------|
| `init` | none (local) | Scaffolds `murrmure/` (actions, executors, hooks, example flow) |
| `link` | `space:write` | `POST /v1/spaces/:id/link` — use `--create` to mint space from `space.yaml` slug |
| `apply` | `space:write` | `POST /v1/spaces/:id/apply` — validate local `murrmure/` and index |
| `status` | `space:read` | `GET /v1/spaces/:id/index/status` |
| `list` | `space:enter` | `GET /v1/spaces` |
| `show <space_id>` | valid token for space | `GET /v1/spaces/:id` |
| `create` | `space:admin` | `POST /v1/spaces` |
| `update <space_id>` | `space:admin` | `PATCH /v1/spaces/:id` |
| `archive <space_id>` | `space:admin` | `POST /v1/spaces/:id/archive` |

`space create` flags: `--slug`, `--name`, `--install-policy`, `--preview-policy`, `--description`, `--parent`.

`space update` accepts `--query-policy '{"inbound_allowlist":["spc_…"]}'` or `@file.json` for cross-space query policy.

Add `--json` for scripting. See [Admin commands (CLI)](./configuration.md) and [Space index](./space-index.md).

### `mrmr action invoke`

```bash
mrmr action invoke my_action --params '{"key":"value"}' --space spc_ui_sandbox
```

Invoke an indexed action from `murrmure/actions.yaml`. Requires **`action:invoke`**. HTTP: `POST /v1/spaces/{id}/actions/{name}/invoke`.

### `mrmr me set-landing`

```bash
mrmr me set-landing --space spc_ui_sandbox
```

Set per-user landing space. Requires **`space:enter`**. HTTP: `PATCH /v1/me`.

### `mrmr view init`

```bash
mrmr view init review-params
```

Scaffold `murrmure/views/{id}/` locally. See [View SDK](../reference/view-sdk).

### `mrmr worker poll`

```bash
mrmr worker poll --executor my_worker --once
```

Long-poll `GET /v1/executor/tasks` for queue_poll executors. Requires grant with **`executor:poll`**.

### `mrmr federation`

```bash
mrmr federation status
mrmr federation peer add --id hub_b --url http://127.0.0.1:8788
```

Register federation peers and inspect relay status. Requires **`space:admin`**.

## Review workflows

Prefer **MCP** for interactive agent loops (`review-loop` flow). There is no `mrmr review` command — use MCP tools or the HTTP API.

## Next

- [Space index](./space-index)
- [Connect your agent](./agents-mcp)
- [HTTP API](../reference/http-api)
