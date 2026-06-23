# Part 1 — Scaffold `daily-brief`

Build a fresh custom capability from scratch with `@studio/capability-sdk`.

## 1. Scaffold the project

```bash
mkdir ~/work/daily-brief && cd ~/work/daily-brief
npm init -y
npm install -D @studio/capability-sdk
studio capability init daily-brief --dir ./capabilities/daily-brief
cd capabilities/daily-brief
```

## 2. Define the contract states and events

Edit `contract/contract.json`:

```json
{
  "schemaVersion": "2.0",
  "id": "daily-brief",
  "version": "1.0.0",
  "initial_state": "pending_agent",
  "terminal_states": ["resolved"],
  "metadata_schema": {
    "type": "object",
    "properties": {
      "request_id": { "type": "string" },
      "requested_at": { "type": "string" },
      "brief_markdown": { "type": "string" },
      "brief_json": { "type": "object" },
      "submitted_at": { "type": "string" }
    }
  },
  "states": [
    { "id": "pending_agent", "kind": "active" },
    { "id": "pending_review", "kind": "active" },
    { "id": "resolved", "kind": "terminal" }
  ],
  "transitions": [
    {
      "id": "submit_brief_output",
      "from": "pending_agent",
      "to": "pending_review",
      "event": "submit_brief_output",
      "actors": ["agent:*"],
      "emit": ["brief.output_submitted"]
    },
    {
      "id": "submit_and_resolve",
      "from": "pending_agent",
      "to": "resolved",
      "event": "submit_and_resolve",
      "actors": ["agent:*"],
      "emit": ["brief.resolved"]
    },
    {
      "id": "mark_done",
      "from": "pending_review",
      "to": "resolved",
      "event": "mark_done",
      "actors": ["human:*"],
      "emit": ["brief.resolved"]
    }
  ],
  "events": {
    "declarations": [
      {
        "type": "brief.requested",
        "schema": {
          "type": "object",
          "required": ["instance_id", "request_id"],
          "properties": {
            "instance_id": { "type": "string" },
            "request_id": { "type": "string" },
            "requested_at": { "type": "string" }
          }
        }
      },
      { "type": "brief.output_submitted", "schema": { "type": "object" } },
      { "type": "brief.resolved", "schema": { "type": "object" } }
    ]
  }
}
```

State flow:

- Normal: `pending_agent` → `pending_review` → `resolved`
- Optional auto-resolve: `pending_agent` → `resolved`

## 3. Canvas bridge + button UI

Copy `ui/src/lib/hub-client.ts` from [Tutorial 1](../01-local-preview-review/01-scaffold-capability) and reuse it as your canvas API client.

### `ui/src/mount.tsx`

```typescript
import { hubJson } from "./lib/hub-client";

const API = "/api/daily-brief";

const CSS = `
  :root { font-family: system-ui, sans-serif; }
  .wrap { padding: 20px; max-width: 720px; }
  .badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #ecfeff; }
  button { padding: 10px 16px; border-radius: 8px; border: 0; background: #0f766e; color: #fff; cursor: pointer; }
  button.secondary { background: #111; margin-left: 8px; }
  .output { margin-top: 16px; border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: #fafafa; }
  pre { white-space: pre-wrap; font-size: 13px; }
`;

interface HostCtx { spaceId: string; instanceId: string; }
interface BriefView {
  instance_id: string;
  state: string;
  brief_markdown?: string;
  brief_json?: Record<string, unknown>;
}

async function load(id: string): Promise<BriefView> {
  return hubJson(`${API}/instances/get`, { method: "POST", body: JSON.stringify({ instance_id: id }) });
}

function render(root: HTMLElement, ctx: HostCtx, view: BriefView) {
  root.innerHTML = `
    <style>${CSS}</style>
    <div class="wrap">
      <h1>Daily brief</h1>
      <p><span class="badge">${view.state}</span></p>
      <button id="run">Run daily brief</button>
      ${view.state === "pending_review" ? `<button class="secondary" id="done">Mark done</button>` : ""}
      ${
        view.brief_markdown
          ? `<div class="output"><pre>${view.brief_markdown}</pre></div>`
          : `<p class="output">No output yet.</p>`
      }
    </div>`;

  root.querySelector("#run")?.addEventListener("click", async () => {
    const created = await hubJson<{ instance_id: string }>(`${API}/requests`, { method: "POST", body: "{}" });
    window.location.href = `?instance=${created.instance_id}`;
  });

  root.querySelector("#done")?.addEventListener("click", async () => {
    await hubJson(`${API}/instances/mark-done`, {
      method: "POST",
      body: JSON.stringify({ instance_id: ctx.instanceId }),
    });
    render(root, ctx, await load(ctx.instanceId));
  });
}

export function mount(root: HTMLElement, ctx: HostCtx): () => void {
  void load(ctx.instanceId).then((view) => render(root, ctx, view));
  return () => { root.innerHTML = ""; };
}

window.addEventListener("message", (ev) => {
  if (ev.data?.type === "init") mount(document.getElementById("root")!, ev.data.ctx);
  if (ev.data?.type === "reload") window.location.reload();
});
```

The **Run daily brief** button calls your capability server, which creates an instance and emits `brief.requested` (trigger source). It does not call the agent directly.

## 4. MCP tools (`contract/mcp-tools.json`)

```json
{
  "tools": {
    "submit_brief_output": {
      "description": "Submit formatted daily brief output for an instance",
      "http": { "method": "POST", "path": "/brief/submit" },
      "input_schema": {
        "type": "object",
        "required": ["instance_id", "brief_markdown", "brief_json"],
        "properties": {
          "instance_id": { "type": "string" },
          "brief_markdown": { "type": "string" },
          "brief_json": { "type": "object" },
          "auto_resolve": { "type": "boolean", "default": false }
        }
      }
    }
  }
}
```

In `capability.manifest.json`, include:

```json
"mcp_tools_by_version": {
  "1.0.0": ["submit_brief_output"]
}
```

## 5. Server routes (`server/hub.ts` + `server/index.ts`)

Copy `server/hub.ts` from Tutorial 1. Then implement:

```typescript
import type { CapabilityServerContext } from "@studio/capability-sdk/server";
import { hubJson } from "./hub.js";

type Ctx = { req: { json: () => unknown }; json: (v: unknown) => unknown };

export function mountRoutes(app: { post: Function }, ctx: CapabilityServerContext) {
  const space = ctx.spaceId;

  app.post("/requests", async (c: Ctx) => {
    const request_id = crypto.randomUUID();
    const created = await hubJson<{ instance_id: string }>(`/v1/spaces/${space}/instances`, {
      method: "POST",
      json: {
        contract_ref_id: ctx.contractRefId,
        metadata: { request_id, requested_at: new Date().toISOString(), output_format: "markdown" },
      },
    });
    await hubJson(`/v1/spaces/${space}/events`, {
      method: "POST",
      json: {
        instance_id: created.instance_id,
        event_type: "brief.requested",
        payload: {
          instance_id: created.instance_id,
          request_id,
          requested_at: new Date().toISOString(),
        },
      },
    });
    return c.json({ instance_id: created.instance_id, state: "pending_agent", request_id });
  });

  app.post("/instances/get", async (c: Ctx) => {
    const { instance_id } = c.req.json() as { instance_id: string };
    const inst = await hubJson<{ state: string; metadata: Record<string, unknown> }>(
      `/v1/spaces/${space}/instances/${instance_id}`,
    );
    return c.json({
      instance_id,
      state: inst.state,
      brief_markdown: inst.metadata.brief_markdown,
      brief_json: inst.metadata.brief_json,
    });
  });

  app.post("/brief/submit", async (c: Ctx) => {
    const body = c.req.json() as {
      instance_id: string;
      brief_markdown: string;
      brief_json: Record<string, unknown>;
      auto_resolve?: boolean;
    };
    const inst = await hubJson<{ revision: number }>(`/v1/spaces/${space}/instances/${body.instance_id}`);
    await hubJson(`/v1/spaces/${space}/instances/${body.instance_id}/metadata`, {
      method: "PATCH",
      json: {
        expected_revision: inst.revision,
        patch: {
          brief_markdown: body.brief_markdown,
          brief_json: body.brief_json,
          submitted_at: new Date().toISOString(),
        },
      },
    });
    const after = await hubJson<{ revision: number }>(`/v1/spaces/${space}/instances/${body.instance_id}`);
    const event = body.auto_resolve ? "submit_and_resolve" : "submit_brief_output";
    await hubJson(`/v1/spaces/${space}/instances/${body.instance_id}/transitions`, {
      method: "POST",
      json: { event, expected_revision: after.revision, actor_id: "agent:cursor" },
    });
    return c.json({ ok: true, state: body.auto_resolve ? "resolved" : "pending_review" });
  });

  app.post("/instances/mark-done", async (c: Ctx) => {
    const { instance_id } = c.req.json() as { instance_id: string };
    const inst = await hubJson<{ revision: number }>(`/v1/spaces/${space}/instances/${instance_id}`);
    await hubJson(`/v1/spaces/${space}/instances/${instance_id}/transitions`, {
      method: "POST",
      json: { event: "mark_done", expected_revision: inst.revision, actor_id: "human:reviewer" },
    });
    return c.json({ ok: true, state: "resolved" });
  });
}
```

Map MCP tool to flat path:

```json
"submit_brief_output": {
  "http": { "method": "POST", "path": "/brief/submit" }
}
```

The browser button emits the event; the trigger handles agent wake; the agent answers through `submit_brief_output`.

## 6. Validate and build

```bash
studio capability validate . --json
studio capability build .
```

## Next

[Part 2 — Push capability and register trigger →](./02-push-and-trigger)
