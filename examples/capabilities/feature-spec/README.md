# feature-spec (CDK reference capability)

A reference capability that manages spec documents through their lifecycle and
answers the cross-space `spec_summary@1` query. It is the canonical example for
the Capability Developer Kit (CDK): contract, MCP tools, config schema, canvas
UI, and server module are laid out exactly as `studio capability init` scaffolds
them.

## Layout

| Path | Purpose |
|------|---------|
| `capability.manifest.json` | CDK manifest (schemaVersion 1) |
| `contract/contract.json` | FSM contract (v2) — states, transitions, events |
| `contract/mcp-tools.json` | MCP tool → HTTP route map |
| `contract/config.schema.json` | Per-install config (`skip_review`, approver role) |
| `ui/` | Canvas shell + mount entry |
| `server/` | Capability server module (`mountRoutes`) |
| `tests/` | Contract reachability test |

## Build and validate

```bash
studio capability validate .
studio capability build .
```

The build bundles `ui/src/mount.tsx` → `ui/entry.js` and `server/index.ts` →
`server/mount.mjs`, writes a resolved `manifest.json`, and computes a
`bundle.digest`.

## Fork it

```bash
studio capability init my-spec --from-example feature-spec
```

## Runtime note

The spec lifecycle is stateful and is persisted through the hub kernel via
`ctx.hub` (host-bridge). After CDK install + live apply, this capability runs
as an isolated worker subprocess. See
[`12-worker-runtime-and-host-bridge.md`](../../studio-specs/current/build-capability/12-worker-runtime-and-host-bridge.md).
