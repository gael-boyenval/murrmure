# Hello authoring (flows tutorial example)

Minimal v2 space directory for the [space handlers guide](../../../apps/docs/guide/space-handlers.md): one indexed flow with handlers — no views.

```bash
cd examples/flows/hello-authoring  # or use this directory as space root
mrmr space apply --strict
```

Layout mirrors what `mrmr space init` scaffolds plus a flow under `.mrmr/flows/`.

## Connect agent (thin MCP)

Use the thin bridge shape:

```bash
mrmr grant mint --space spc_... --label "cursor-agent"
mrmr grant use --space spc_...
```

MCP config should use `command: "murrmure-mcp"` with `MURRMURE_HUB_TOKEN` only.
