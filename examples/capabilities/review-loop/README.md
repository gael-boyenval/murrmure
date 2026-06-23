# review-loop (CDK reference capability)

A reference capability that runs human/agent review rounds over a preview
target. It demonstrates a gated terminal transition (`request_production` →
`production_approved`) and a comment thread surface on the canvas.

## Layout

| Path | Purpose |
|------|---------|
| `capability.manifest.json` | CDK manifest (schemaVersion 1) |
| `contract/contract.json` | FSM contract (v2) — review rounds and convergence |
| `contract/mcp-tools.json` | MCP tool → HTTP route map |
| `contract/config.schema.json` | Per-install config |
| `ui/` | Canvas shell + mount entry |
| `server/` | Capability server module (`mountRoutes`) |
| `tests/` | Contract reachability test |

## Build and validate

```bash
studio capability validate .
studio capability build .
```

## Fork it

```bash
studio capability init my-review --from-example review-loop
```

## Runtime note

Review sessions are stateful and persisted through the hub kernel via `ctx.hub`
(host-bridge). After CDK install + live apply, this capability runs as an
isolated worker subprocess. See
[`12-worker-runtime-and-host-bridge.md`](../../studio-specs/current/build-capability/12-worker-runtime-and-host-bridge.md).
