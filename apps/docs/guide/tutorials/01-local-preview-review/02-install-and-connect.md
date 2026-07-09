# Part 2 — Install and connect

Connect one coding agent to your local Murrmure hub using the thin MCP bridge shape.

## 1) Install CLI + MCP bridge

```bash
npm install -g @murrmure/cli @murrmure/mcp-bridge
```

## 2) Run setup in your project

```bash
cd ~/work/my-feature-site
mrmr setup
```

This handles login, space creation/link/apply, skill install, and grant mint.

## 3) Mint and activate a grant (manual path)

If you skipped the wizard grant step:

```bash
mrmr grant mint --space spc_... --label "preview-review-agent" --capabilities space:read,flow:run,flow:read,action:invoke,step:resolve,journal:read
mrmr grant use --space spc_...
```

`grant mint` prints:

```bash
export MURRMURE_HUB_TOKEN=tok_...
```

Run this export in the shell that launches your IDE.

## 4) MCP config

Use the prompt from `mrmr grant mint` to write this automatically, or create it manually:

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure-mcp",
      "env": {
        "MURRMURE_HUB_TOKEN": "${env:MURRMURE_HUB_TOKEN}"
      }
    }
  }
}
```

Default file: `~/.cursor/mcp.json`  
Project-only: `mrmr grant mint --local`

## 5) Verify connectivity

Reload MCP in your IDE, then ask the agent to call:

- `murrmure_space_status`
- `murrmure_get_run` (after you start a run)

If both respond, your bridge/token setup is healthy.

## Next

[Part 3 — Run the feedback loop →](./03-run-feedback-loop)
