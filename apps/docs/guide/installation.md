# Installation and dependencies

This page answers one question quickly: **which package do I actually need?**

## Step 0: most users install nothing

- **Reviewers and admins:** no npm install required
- Use the browser shell only:
  - Cloud: [app.murrmure.dev](https://app.murrmure.dev)
  - Self-hosted: your org shell URL

Install npm packages only if you run agents, scripts/CI, or build flows.

## Step 1: prerequisites (for agent tooling)

- **Node.js 20+**
- Access to a Murrmure workspace/space
- A minted grant token (`tok_...`) from **Configure → Agent grants**
- Target space id (`spc_...`) for `MURRMURE_SPACE_ID`

## Step 2: choose your package(s)

| Package | Needed by | Install | What you get |
|---------|-----------|---------|--------------|
| `@murrmure/cli` | Agent operators (Cursor/Claude) | `npm install -g @murrmure/cli` | `murrmure` MCP server so agents can call Murrmure tools |
| `@murrmure/cli` | Optional CI/scripts/operators | `npm install -g @murrmure/cli` | `mrmr` commands for health, audit, transitions, automation |
| `@murrmure/cli` | Flow builders only | `npm install -D @murrmure/cli` | FDK commands to init/validate/build/push flow bundles |

If you prefer no global installs:

```bash
npx @murrmure/cli
npx @murrmure/cli health
```

## Step 3: standard agent setup (`@murrmure/cli`)

1. Install:

```bash
npm install -g @murrmure/cli
```

2. Add MCP config in your agent client:

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "https://api.murrmure.dev",
        "MURRMURE_HUB_TOKEN": "tok_...",
        "MURRMURE_SPACE_ID": "spc_..."
      }
    }
  }
}
```

3. Reload the client.
4. Ask the agent to call `get_space_state` to confirm connectivity.

For self-hosted, keep the same keys and set `MURRMURE_HUB_URL` to your hub URL.

## Step 4: optional CLI setup (`@murrmure/cli`)

```bash
npm install -g @murrmure/cli
mrmr login
mrmr whoami
```

Use CLI for scripts/CI and operator workflows. Interactive agent loops still go through MCP.

## Step 5: builder-only setup (`@murrmure/cli` + `@murrmure/flow-dev-kit`)

In your flow repository (not needed for normal review/spec usage):

```bash
npm install -D @murrmure/cli
npm install @murrmure/flow-dev-kit
mrmr flow init my-flow --dir ./workflows/my-flow
mrmr flow validate ./workflows/my-flow
mrmr flow build ./workflows/my-flow
```

Use this package only when authoring or evolving flows.

## CI / headless environment

```bash
export MURRMURE_HUB_URL=https://api.murrmure.dev
export MURRMURE_HUB_TOKEN=tok_your_grant_token
export MURRMURE_SPACE_ID=spc_your_space_id
```

## You do not need for normal onboarding

- `curl`-driven setup
- cloning platform monorepos
- running hub daemon commands (unless you self-host)
- host-level vars like `DATABASE_PATH` (operator-only)

## Next

- [How it fits together](./how-it-fits-together)
- [Connect your agent](./agents-mcp)
- [Quick start](./quick-start)
