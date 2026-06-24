# CLI

**Optional** — for CI, scripts, and operators who prefer the terminal. Interactive agent work uses **[MCP](./agents-mcp)**; admin setup uses the **[browser](./browser)** or CLI.

The Murrmure CLI (`@murrmure/cli`, binaries `mrmr` / `murrmure`) talks to **Murrmure Cloud** or your org's hub:

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
| `space` | Spaces, grants, members, triggers (Configure parity) |
| `hub` | Federation and operator exports |
| `runtime` | Events, gates, transitions, waits, audit |
| `flow` | Flow Dev Kit — init, validate, build, push, dev, evolution |
| `skill` | Install/update the murrmure-flow agent skill |

**MCP** (separate binary): `murrmure-mcp` / `mrmr-mcp` — see [Connect your agent](./agents-mcp).

## Doctor

Diagnose auth, hub reachability, and scope gaps before pushing flows:

```bash
mrmr doctor
mrmr doctor --json
```

Human output includes auth source, hub status, per-space scopes, and capability summary (push flows / mint grants / register triggers). JSON shape: `{ ok, issues, profile }`.

> `mrmr flow doctor` is deprecated — it prints a stderr hint and delegates to `mrmr doctor`.

## Login

Save hub URL and bearer token locally (interactive prompts; optional `--open` to open Configure in the browser):

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

## Environment (CI / scripts)

```bash
export MURRMURE_HUB_URL=https://api.murrmure.dev
export MURRMURE_HUB_TOKEN=tok_your_grant_token
export MURRMURE_SPACE_ID=spc_your_space_id
```

## Flow Dev Kit (FDK)

For **authoring workflows** in your own repo, install **`@murrmure/cli`** and **`@murrmure/flow-dev-kit`**:

```bash
npm install -D @murrmure/cli
npm install @murrmure/flow-dev-kit
```

```bash
mrmr flow init my-flow --dir ./workflows/my-flow
mrmr flow validate .
mrmr flow build .
mrmr flow dev ./workflows/my-flow --sim --port 4310
mrmr flow push --space spc_ui_sandbox
mrmr flow apply --space spc_ui_sandbox --install ins_…
```

**Agent skill** (optional — teaches Cursor agents the evolution checklist):

```bash
mrmr skill install
mrmr skill update    # after upgrading @murrmure/skill
```

See [Agent skill](./agent-skill).

Environment (same as hub client):

```bash
export MURRMURE_HUB_URL=http://127.0.0.1:8787
export MURRMURE_HUB_TOKEN=tok_your_grant
export MURRMURE_SPACE_ID=spc_ui_sandbox
```

All `mrmr flow` and `mrmr skill` subcommands support `--json` for scripts. See **[Flows tutorial](./flows-tutorial)**, [Flow Dev Kit reference](../reference/flow-dev-kit), and [Agent skill](./agent-skill).

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

### `mrmr runtime transition`

```bash
mrmr runtime transition --space spc_abc123 ins_xyz finish_review 2
```

Apply a workflow transition. Typical grant scope: `state:transition`.

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

Configure parity — create and manage spaces from the terminal. Requires **`space:admin`** for mutating commands (bootstrap token works on an empty hub).

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
| `init` | `space:admin` | Interactive wizard (connect, create, instructions) |
| `list` | `space:enter` | `GET /v1/spaces` |
| `show <space_id>` | valid token for space | `GET /v1/spaces/:id` |
| `create` | `space:admin` | `POST /v1/spaces` |
| `update <space_id>` | `space:admin` | `PATCH /v1/spaces/:id` |
| `archive <space_id>` | `space:admin` | `POST /v1/spaces/:id/archive` |

`space create` flags: `--slug`, `--name`, `--install-policy`, `--preview-policy`, `--description`, `--parent`.

`space update` accepts `--query-policy '{"inbound_allowlist":["spc_…"]}'` or `@file.json` for cross-space query policy.

Add `--json` for scripting. See [Configuration](./configuration.md) for the full setup wizard mapping.

## Review workflows

Prefer **MCP** for interactive agent loops (`review-loop` flow). There is no `mrmr review` command — use MCP tools or the HTTP API.

## Next

- [Connect your agent](./agents-mcp)
- [HTTP API](../reference/http-api)
