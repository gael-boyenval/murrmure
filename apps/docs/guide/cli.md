# CLI

**Optional** — for CI, scripts, and operators who prefer the terminal. Interactive agent work uses **[MCP](./agents-mcp)**; admin setup uses the **[browser](./browser)**.

The Studio CLI (`@studio/cli`) talks to **Studio Cloud** or your org's hub:

```bash
npm install -g @studio/cli
```

## Login

```bash
studio login
```

Opens the browser to authorize, or paste a grant token from **Configure → Agent grants** (same token as MCP).

Check identity:

```bash
studio whoami
```

## Environment (CI / scripts)

```bash
export STUDIO_HUB_URL=https://api.studio.dev
export STUDIO_HUB_TOKEN=tok_your_grant_token
export STUDIO_SPACE_ID=spc_your_space_id
```

## Capability Developer Kit (CDK)

For **authoring workflows** in your own repo, use `@studio/capability-sdk` (not `@studio/cli`):

```bash
npm install -D @studio/capability-sdk
```

```bash
studio capability init my-flow --dir ./workflows/my-flow
studio capability validate .
studio capability build .
studio capability dev ./workflows/my-flow --sim --port 4310
studio capability push --space spc_ui_sandbox
studio capability apply --space spc_ui_sandbox --install cap_…
```

**Agent skill** (optional — teaches Cursor agents the evolution checklist):

```bash
studio skill install
studio skill update    # after upgrading @studio/skill
```

See [Agent skill](./agent-skill).

Environment (same as hub client):

```bash
export STUDIO_HUB_URL=http://127.0.0.1:8787
export STUDIO_TOKEN=tok_your_grant
export STUDIO_SPACE_ID=spc_ui_sandbox
```

All subcommands support `--json`. See **[Capabilities tutorial](./capabilities-tutorial)**, [Capability SDK reference](../reference/capability-sdk), and [Agent skill](./agent-skill).

---

## Platform CLI commands

### `studio health`

```bash
studio health
```

Service status and API version.

### `studio events <space_id> [from_seq]`

```bash
studio events spc_abc123 0
```

Tail journal events for a space.

### `studio gates <space_id>`

```bash
studio gates spc_abc123
```

List pending human gates.

### `studio transition <space_id> <instance_id> <event> <revision>`

```bash
studio transition spc_abc123 ins_xyz finish_review 2
```

Apply a workflow transition.

### `studio wait <space_id> <wait_id>`

Poll until a registered wait resolves.

### `studio audit export <space_id> [since]`

Download audit JSONL to stdout.

```bash
studio audit export spc_abc123 0 > audit.jsonl
```

## Review from CLI

Prefer MCP for interactive agent loops. For automation:

```bash
studio review create --space spc_abc --url https://preview.example.com --title "Sprint review"
studio review wait ins_xyz --timeout 600
```

(Exact subcommands match `studio review --help`.)

## Next

- [Connect your agent](./agents-mcp)
- [HTTP API](../reference/http-api)
