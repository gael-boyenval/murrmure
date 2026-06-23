# Installation and dependencies

This page answers one question quickly: **which package do I actually need?**

## Step 0: most users install nothing

- **Reviewers and admins:** no npm install required
- Use the browser shell only:
  - Cloud: [app.studio.dev](https://app.studio.dev)
  - Self-hosted: your org shell URL

Install npm packages only if you run agents, scripts/CI, or build capabilities.

## Step 1: prerequisites (for agent tooling)

- **Node.js 20+**
- Access to a Studio workspace/space
- A minted grant token (`tok_...`) from **Configure → Agent grants**
- Target space id (`spc_...`) for `STUDIO_SPACE_ID`

## Step 2: choose your package(s)

| Package | Needed by | Install | What you get |
|---------|-----------|---------|--------------|
| `@studio/hub-mcp` | Agent operators (Cursor/Claude) | `npm install -g @studio/hub-mcp` | `studio-hub-mcp` MCP server so agents can call Studio tools |
| `@studio/cli` | Optional CI/scripts/operators | `npm install -g @studio/cli` | `studio` commands for health, audit, transitions, automation |
| `@studio/capability-sdk` | Capability builders only | `npm install -D @studio/capability-sdk` | CDK commands to init/validate/build/push capability bundles |

If you prefer no global installs:

```bash
npx @studio/hub-mcp
npx @studio/cli health
```

## Step 3: standard agent setup (`@studio/hub-mcp`)

1. Install:

```bash
npm install -g @studio/hub-mcp
```

2. Add MCP config in your agent client:

```json
{
  "mcpServers": {
    "studio": {
      "command": "studio-hub-mcp",
      "env": {
        "STUDIO_HUB_URL": "https://api.studio.dev",
        "STUDIO_HUB_TOKEN": "tok_...",
        "STUDIO_SPACE_ID": "spc_..."
      }
    }
  }
}
```

3. Reload the client.
4. Ask the agent to call `get_space_state` to confirm connectivity.

For self-hosted, keep the same keys and set `STUDIO_HUB_URL` to your hub URL.

## Step 4: optional CLI setup (`@studio/cli`)

```bash
npm install -g @studio/cli
studio login
studio whoami
```

Use CLI for scripts/CI and operator workflows. Interactive agent loops still go through MCP.

## Step 5: builder-only setup (`@studio/capability-sdk`)

In your capability repository (not needed for normal review/spec usage):

```bash
npm install -D @studio/capability-sdk
studio capability init my-flow --dir ./workflows/my-flow
studio capability validate ./workflows/my-flow
studio capability build ./workflows/my-flow
```

Use this package only when authoring or evolving capabilities.

## CI / headless environment

```bash
export STUDIO_HUB_URL=https://api.studio.dev
export STUDIO_HUB_TOKEN=tok_your_grant_token
export STUDIO_SPACE_ID=spc_your_space_id
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
