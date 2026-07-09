# Team brief v2 (Tutorial 2 example)

Three-space orchestration tutorial uses **indexed flows** in `murrmure/` — not worker packages.

This tree is the **orchestrator space** (`team-brief` flow + hooks). Knowledge and dev spaces use grants + cross-space invoke as described in [Tutorial 2](../../../apps/docs/guide/tutorials/02-multi-agent-brief/).

```bash
mrmr space apply --strict
```

## Connect agent (thin MCP)

For each space agent, mint and activate a scoped token:

```bash
mrmr grant mint --space spc_... --label "cursor-agent"
mrmr grant use --space spc_...
```

Use the thin MCP config shape with `command: "murrmure-mcp"` and `MURRMURE_HUB_TOKEN` only.
