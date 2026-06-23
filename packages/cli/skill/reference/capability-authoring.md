# Flow authoring (FDK)

User flows live **in your repo**, not in the Murrmure platform monorepo.

## Scaffold

```bash
npm install -D @murrmure/cli
npm install @murrmure/flow-dev-kit
mrmr flow init my-flow --dir ./workflows/my-flow --with-skill
cd workflows/my-flow
```

`--with-skill` installs `.cursor/skills/murrmure-flow/` in the current directory.

## Package layout

```text
my-flow/
├── flow.manifest.json    # id, version, routes_prefix, ui, mcp_tools_by_version
├── contract/
│   ├── contract.json           # ContractV2 state machine
│   ├── mcp-tools.json          # tool name → HTTP map + input_schema
│   └── config.schema.json
├── server/
│   ├── index.ts                # mountRoutes(app, ctx)
│   └── mount.mjs               # built worker entry
├── ui/
│   ├── shell.html
│   └── src/mount.tsx           # React canvas
└── tests/contract/
```

## flow.manifest.json essentials

```json
{
  "schemaVersion": "1",
  "id": "my-flow",
  "version": "0.1.0",
  "routes_prefix": "/api/my-flow",
  "ui": {
    "entry": "ui/entry.js",
    "canvas_route": "/spaces/:spaceId/instances/:instanceId/canvas/my-flow",
    "shell_html": "ui/shell.html"
  },
  "server": { "mount_module": "server/mount.mjs" },
  "mcp_tools_by_version": {
    "0.1.0": ["ping", "open_session"]
  }
}
```

## MCP tools (`contract/mcp-tools.json`)

Every tool in `mcp_tools_by_version` must have an entry:

```json
{
  "tools": {
    "open_session": {
      "description": "Create a review instance",
      "http": { "method": "POST", "path": "/sessions" },
      "input_schema": {
        "type": "object",
        "properties": { "preview_url": { "type": "string" } }
      }
    }
  }
}
```

Hub invokes via worker HTTP under `routes_prefix`. Agents see tools only when install is **live** and grant `flow_acl` includes the package id.

## Server (`server/index.ts`)

```typescript
import type { FlowServerContext, HonoLike } from "@murrmure/flow-dev-kit/server";

export function mountRoutes(app: HonoLike, ctx: FlowServerContext): void {
  app.get("/health", (c) => c.json({ ok: true, flow: ctx.flowId }));
}
```

## UI (`ui/src/mount.tsx`)

Use `@murrmure/flow-dev-kit/react` for provider, hooks, and error boundaries. Mount receives `FlowHostContext` from the shell iframe bridge.

## Local dev

```bash
mrmr flow dev . --sim --port 4310
```

Sim mode runs a local shell + server mount without hub connectivity.

## Push to hub

```bash
mrmr flow validate .
mrmr flow build .
mrmr flow push --space spc_ui_sandbox --json
```

Then run the full evolution pipeline — see [evolution-pipeline.md](./evolution-pipeline.md).
