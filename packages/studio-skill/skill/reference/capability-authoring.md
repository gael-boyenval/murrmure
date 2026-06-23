# Capability authoring (CDK)

User capabilities live **in your repo**, not in the Studio platform monorepo.

## Scaffold

```bash
npm install -D @studio/capability-sdk
studio capability init my-flow --dir ./workflows/my-flow --with-skill
cd workflows/my-flow
```

`--with-skill` installs `.cursor/skills/studio-capability/` in the current directory.

## Package layout

```text
my-flow/
├── capability.manifest.json    # id, version, routes_prefix, ui, mcp_tools_by_version
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

## capability.manifest.json essentials

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

Hub invokes via worker HTTP under `routes_prefix`. Agents see tools only when install is **live** and grant `capability_acl` includes the package id.

## Server (`server/index.ts`)

```typescript
import type { CapabilityServerContext, HonoLike } from "@studio/capability-sdk/server";

export function mountRoutes(app: HonoLike, ctx: CapabilityServerContext): void {
  app.get("/health", (c) => c.json({ ok: true, package: ctx.packageId }));

  app.post("/sessions", async (c) => {
    const body = await c.req.json();
    const result = await ctx.hub.execute({
      kind: "instance.create",
      provenance: { actor_id: "agent", token_id: "worker" },
      contract_ref_id: ctx.contractRefId,
      metadata: { title: body.title, preview_url: body.preview_url },
    });
    // return instance_id, studio_url for humans
    return c.json(result.body, 201);
  });
}
```

Return `instance_id` and a canvas path so humans can open Runtime. Hub MCP may enrich responses with `studio_url`.

## UI canvas

Shell loads:

```text
{hub}/capabilities/{package_id}/{version}/ui/shell.html?instance={instance_id}
```

Use `@studio/capability-dev-kit` bridge for hub-fetch from the iframe. Humans interact here; agents use MCP.

## Local dev

```bash
studio capability dev . --space spc_ui_sandbox        # watch + push
studio capability dev . --space spc_ui_sandbox --auto-apply
studio capability dev . --sim --port 4310             # no hub
```

## Examples in platform repo

`examples/capabilities/review-loop`, `feature-spec` — copy patterns, do not fork into hub source.
