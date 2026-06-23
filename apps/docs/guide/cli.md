# CLI

**Optional** — for CI, scripts, and operators who prefer the terminal. Interactive agent work uses **[MCP](./agents-mcp)**; admin setup uses the **[browser](./browser)**.

The Murrmure CLI (`@murrmure/cli`) talks to **Murrmure Cloud** or your org's hub:

```bash
npm install -g @murrmure/cli
```

## Login

```bash
mrmr login
```

Opens the browser to authorize, or paste a grant token from **Configure → Agent grants** (same token as MCP).

Check identity:

```bash
mrmr whoami
```

## Environment (CI / scripts)

```bash
export MURRMURE_HUB_URL=https://api.murrmure.dev
export MURRMURE_HUB_TOKEN=tok_your_grant_token
export MURRMURE_SPACE_ID=spc_your_space_id
```

## Flow Dev Kit (FDK)

For **authoring workflows** in your own repo, use `@murrmure/cli` (not `@murrmure/cli`):

```bash
npm install -D @murrmure/cli
```

```bash
mrmr flow init my-flow --dir ./workflows/my-flow
mrmr flow validate .
mrmr flow build .
mrmr flow dev ./workflows/my-flow --sim --port 4310
mrmr flow push --space spc_ui_sandbox
mrmr flow apply --space spc_ui_sandbox --install cap_…
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
export MURRMURE_TOKEN=tok_your_grant
export MURRMURE_SPACE_ID=spc_ui_sandbox
```

All subcommands support `--json`. See **[Flows tutorial](./flows-tutorial)**, [Flow Dev Kit reference](../reference/flow-dev-kit), and [Agent skill](./agent-skill).

---

## Platform CLI commands

### `mrmr health`

```bash
mrmr health
```

Service status and API version.

### `mrmr events <space_id> [from_seq]`

```bash
mrmr events spc_abc123 0
```

Tail journal events for a space.

### `mrmr gates <space_id>`

```bash
mrmr gates spc_abc123
```

List pending human gates.

### `mrmr transition <space_id> <instance_id> <event> <revision>`

```bash
mrmr transition spc_abc123 ins_xyz finish_review 2
```

Apply a workflow transition.

### `mrmr wait <space_id> <wait_id>`

Poll until a registered wait resolves.

### `mrmr audit export <space_id> [since]`

Download audit JSONL to stdout.

```bash
mrmr audit export spc_abc123 0 > audit.jsonl
```

## Review from CLI

Prefer MCP for interactive agent loops. For automation:

```bash
mrmr review create --space spc_abc --url https://preview.example.com --title "Sprint review"
mrmr review wait ins_xyz --timeout 600
```

(Exact subcommands match `mrmr review --help`.)

## Next

- [Connect your agent](./agents-mcp)
- [HTTP API](../reference/http-api)
