# Agent skill package

Install split **`murrmure-agent`** and **`murrmure-developer`** skills from `@murrmure/cli`:

```bash
mrmr skill install --variant all      # both (default when .mrmr/flows or views exist)
mrmr skill install --variant agent    # runtime agents only
mrmr skill install --variant developer  # flow/view authors only
mrmr skill update --variant agent
```

| Variant | Path |
|---------|------|
| agent | `.cursor/skills/murrmure-agent/` |
| developer | `.cursor/skills/murrmure-developer/` |

Guide: [Agent skill](../guide/agent-skill) — verify only; agents should read installed skill files, not human docs.

Reference: [MCP tools](./mcp-tools) · [View SDK](./view-sdk)
