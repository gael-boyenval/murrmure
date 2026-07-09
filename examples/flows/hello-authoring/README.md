# Hello authoring (flows tutorial example)

Minimal v2 space directory for the [flows tutorial](../../../apps/docs/guide/flows-tutorial.md): one indexed flow with actions, executors, and hooks — no views.

```bash
cd demo-space  # or this directory's parent as space root
mrmr space apply --strict
```

Layout mirrors what `mrmr space flow init hello --template hello-invoke` scaffolds.

## Connect agent (thin MCP)

Use the thin bridge shape:

```bash
mrmr grant mint --space spc_... --label "cursor-agent"
mrmr grant use --space spc_...
```

MCP config should use `command: "murrmure-mcp"` with `MURRMURE_HUB_TOKEN` only.
