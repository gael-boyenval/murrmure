# Quick start (5 minutes)

Goal: get one human and one agent through a complete review handoff using browser + MCP.

If architecture is new, skim [How Studio fits together](./how-it-fits-together) first (2 minutes).

## 1) Sign in

- **Cloud:** [app.studio.dev/signup](https://app.studio.dev/signup)
- **Self-hosted:** open your shell URL, then complete `/connect` and `/setup`

## 2) Create (or pick) a space

In **Configure**:

1. Create a space (or use your sandbox space)
2. For sandbox use, choose install policy `authorized_agents`
3. Copy the space id (`spc_...`) — you need it for MCP config

## 3) Install the Review loop capability

In **Configure → [space] → Capabilities**:

1. Click **Install capability**
2. Choose **Human ↔ agent review** (`review-loop`)
3. Open the install row and run: **Validate → Test → Promote → Apply live**
4. Confirm state is **`live`**

## 4) Mint an agent token

In **Configure → [space] → Agent grants**:

1. Click **Mint grant**
2. Choose template **Worker**
3. Pick harness (for example `cursor-local`)
4. Copy the one-time token (`tok_...`)

## 5) Connect your agent over MCP

Install package:

```bash
npm install -g @studio/hub-mcp
```

Paste MCP config into Cursor/Claude:

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

Reload your IDE/client.

## 6) Smoke test connection

Ask your agent:

> Call `get_space_state` and summarize what you see.

If you get JSON back, MCP is connected.

## 7) Start a review round from the agent

Ask your agent:

> Create a review session for `https://your-preview.example.com` titled "Homepage pass 1".

The tool returns an instance/session key (`ins_...`).

## 8) Complete the human handoff in the browser

In **Runtime → [space] → Instances**:

1. Open the new review session
2. Add comments
3. Click **Finish review**

The agent's `wait_for_review` call resolves with structured `comments[]`.

## 9) Iterate

Agent applies feedback, updates preview URL, and starts the next round until converged.

## Done

Want to build your own review loop from scratch? Continue with [Tutorial 1 — Local preview review](./tutorials/01-local-preview-review/).

- [Tutorials overview](./tutorials/)
- [How it fits together](./how-it-fits-together)
- [Connect your agent](./agents-mcp)
- [Browser app](./browser)
- [Troubleshooting](./troubleshooting)
