# Installation and dependencies

This page answers one question quickly: **which package do I actually need?**

## Step 0: install Murrmure Desktop first

**Reviewers and admins** start with [Murrmure Desktop](./desktop) — the observer shell and local hub. No npm install required for day-to-day human work.

Install npm packages when you run agents, scripts/CI, or author indexed flows.

## Step 1: prerequisites (for CLI and agents)

- **Node.js 20+**
- Murrmure Desktop running (or hub reachable at `http://127.0.0.1:8787`)
- A minted grant token (`tok_...`) from **`mrmr grant mint`**

## Step 2: choose your package(s)

| Package | Needed by | Install | What you get |
|---------|-----------|---------|--------------|
| `@murrmure/cli` | Operators + authors | `npm install -g @murrmure/cli` | `mrmr` setup, space apply, grant workflows |
| `@murrmure/mcp-bridge` | Agent MCP clients | Bundled with **Murrmure Desktop**; `npm install -g` only for headless/CI without Desktop | `murrmure-mcp` MCP stdio bridge |

If you prefer no global installs:

```bash
npx @murrmure/cli health
```

## Step 3: standard agent setup

1. Install CLI (MCP bridge ships inside Murrmure Desktop — no extra install when Desktop is running):

```bash
npm install -g @murrmure/cli
```

2. First-run wizard (recommended):

```bash
mrmr setup
```

Or mint a grant manually:

```bash
mrmr grant mint --space spc_… --label "my-agent" --capabilities flow:run,step:resolve,space:read
mrmr grant use --space spc_…
```

3. Add MCP config in your agent client — see [Connect your agent](./agents-mcp).

4. Ask the agent to call `murrmure_space_status` to confirm connectivity.

## Step 4: flow author setup

```bash
mrmr space init
# Write .mrmr/flows/{name}/flow.manifest.yaml + .mrmr/space/handlers.yaml — see Tutorial 1
mrmr space link --path . --create
mrmr space apply --strict
mrmr skill install --variant all
```

See [Tutorial 1](./tutorials/01-local-preview-review/), [Creating flows](./creating-flows), and [Space handlers](./space-handlers).

## CI / headless environment

```bash
export MURRMURE_HUB_URL=http://127.0.0.1:8787
export MURRMURE_HUB_TOKEN=tok_your_grant_token
mrmr setup --yes --json
```

## You do not need for normal onboarding

- cloning platform monorepos
- running hub daemon commands manually (Desktop starts the hub)
- host-level vars like `DATABASE_PATH` (contributor-only)

## Next

- [Quick start](./quick-start)
- [Murrmure Desktop](./desktop)
- [Connect your agent](./agents-mcp)
