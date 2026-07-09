# Daily brief v2 (Tutorial 3 example)

Event-driven daily brief: **checkpoint view** in **ViewCanvasHost** → hook wake → agent output → human review.

```bash
cd murrmure/views/daily-brief && npm install && npm run build
cd ../../..
mrmr space apply --strict
```

See [Tutorial 3](../../../apps/docs/guide/tutorials/03-daily-brief-trigger/).

## Connect agent (thin MCP)

Use only `murrmure-mcp` and `MURRMURE_HUB_TOKEN` in MCP config.
Mint and activate the token:

```bash
mrmr grant mint --space spc_... --label "cursor-agent"
mrmr grant use --space spc_...
```
