# Orchestrator with review sub-flow

Demonstrates **Phase 14 flow-call composition**:

- `orchestrator/flow.manifest.yaml` — parent flow with `start_flow` step
- `review-url/flow.manifest.yaml` — child flow with `start.flow_call: true`

After `mrmr space apply`, run:

```bash
mrmr flow run flw_orchestrator_with_review_orchestrator --input '{"topic":"demo"}'
```

The session flowchart shows the parent run with a linked child run under the `review` step.

## Connect agent (thin MCP)

Use `murrmure-mcp` with `MURRMURE_HUB_TOKEN` (no legacy CLI command shape):

```bash
mrmr grant mint --space spc_... --label "cursor-agent"
mrmr grant use --space spc_...
```
