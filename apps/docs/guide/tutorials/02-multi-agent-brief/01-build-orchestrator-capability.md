# Part 1 — Build `team-brief` from scratch

Create the smallest custom capability that supports:

- brief drafting in orchestrator space,
- a human Publish gate,
- `brief.published` event emission,
- cross-space summary via `query_ask`,
- and `wait_for_publish` pending/resolved behavior.

## 1. Scaffold a clean capability project

```bash
mkdir -p ~/work/orchestrator && cd ~/work/orchestrator
npm init -y
npm install -D @studio/capability-sdk
studio capability init team-brief --dir ./capabilities/team-brief
cd capabilities/team-brief
```

## 2. Define contract states and publish event

Edit `contract/contract.json`:

```json
{
  "schemaVersion": "2.0",
  "id": "team-brief",
  "version": "1.0.0",
  "initial_state": "gathering",
  "terminal_states": ["published"],
  "metadata_schema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "summary": { "type": "string" },
      "version": { "type": "integer", "minimum": 1 },
      "sections": {
        "type": "object",
        "additionalProperties": {
          "type": "object",
          "required": ["title", "body", "order"],
          "properties": {
            "title": { "type": "string" },
            "body": { "type": "string" },
            "order": { "type": "integer" }
          }
        }
      },
      "published_at": { "type": "string", "format": "date-time" }
    }
  },
  "states": [
    { "id": "gathering", "kind": "active" },
    { "id": "draft", "kind": "active" },
    { "id": "pending_publish", "kind": "active" },
    { "id": "published", "kind": "terminal" }
  ],
  "transitions": [
    { "id": "t_open", "from": null, "to": "gathering", "event": "open_brief", "actors": ["agent:*", "human:*"] },
    { "id": "t_context_ready", "from": "gathering", "to": "draft", "event": "context_ready", "actors": ["agent:*", "human:*"] },
    { "id": "t_request_publish", "from": "draft", "to": "pending_publish", "event": "request_publish", "actors": ["agent:*", "human:*"] },
    {
      "id": "t_publish",
      "from": "pending_publish",
      "to": "published",
      "event": "publish",
      "actors": ["human:*"],
      "gate": { "role_from_config": "required_publisher_role" }
    }
  ],
  "events": {
    "declarations": [
      {
        "type": "brief.published",
        "emit_on": ["enter:published"],
        "payload_schema": {
          "type": "object",
          "required": ["brief_key", "title", "version", "summary", "published_by", "section_count"],
          "properties": {
            "brief_key": { "type": "string" },
            "title": { "type": "string" },
            "version": { "type": "integer" },
            "summary": { "type": "string" },
            "published_by": { "type": "string" },
            "section_count": { "type": "integer" }
          }
        }
      }
    ]
  },
  "inbound_queries": {
    "brief_summary@1": {
      "description": "Minimal published brief summary for cross-space reads",
      "request_schema": {
        "type": "object",
        "properties": {
          "brief_key": { "type": "string" }
        },
        "additionalProperties": false
      },
      "response_schema": {
        "type": "object",
        "required": ["brief_key", "title", "version", "summary"],
        "properties": {
          "brief_key": { "type": "string" },
          "title": { "type": "string" },
          "version": { "type": "integer" },
          "summary": { "type": "string" },
          "section_count": { "type": "integer" },
          "published_at": { "type": "string", "format": "date-time" }
        },
        "additionalProperties": false
      }
    }
  }
}
```

State intent:

| State | Pending on | Resolved when |
|-------|------------|---------------|
| `gathering` | Orchestrator collecting inputs | `transition` event `context_ready` |
| `draft` | Orchestrator still editing sections | `transition` event `request_publish` |
| `pending_publish` | Human action in canvas | Human clicks **Publish** |
| `published` | No pending work in Studio | Event `brief.published` emitted |

## 3. Register MCP tools for orchestrator actions

Edit `contract/mcp-tools.json`:

```json
{
  "tools": {
    "open_brief": {
      "description": "Create a new brief instance",
      "http": { "method": "POST", "path": "/briefs" },
      "input_schema": {
        "type": "object",
        "required": ["title"],
        "properties": {
          "title": { "type": "string" }
        }
      }
    },
    "patch_section": {
      "description": "Create or update a brief section",
      "http": { "method": "PATCH", "path": "/briefs/:brief_key/sections/:section_id" },
      "input_schema": {
        "type": "object",
        "required": ["brief_key", "section_id", "title", "body", "order"],
        "properties": {
          "brief_key": { "type": "string" },
          "section_id": { "type": "string" },
          "title": { "type": "string" },
          "body": { "type": "string" },
          "order": { "type": "integer" }
        }
      }
    },
    "get_brief": {
      "description": "Read brief state and sections",
      "http": { "method": "GET", "path": "/briefs/:brief_key" },
      "input_schema": {
        "type": "object",
        "required": ["brief_key"],
        "properties": {
          "brief_key": { "type": "string" }
        }
      }
    },
    "wait_for_publish": {
      "description": "Wait until the brief is published",
      "http": { "method": "POST", "path": "/briefs/:brief_key/wait-for-publish" },
      "input_schema": {
        "type": "object",
        "required": ["brief_key"],
        "properties": {
          "brief_key": { "type": "string" },
          "timeout_ms": { "type": "integer", "minimum": 1 }
        }
      }
    }
  }
}
```

In `capability.manifest.json`, set `mcp_tools_by_version["1.0.0"]` to:

```json
["open_brief", "patch_section", "get_brief", "wait_for_publish"]
```

Use the platform `transition` tool for `context_ready`, `request_publish`, and `publish`.

## 4. Canvas + server code

Copy `ui/src/lib/hub-client.ts` from [Tutorial 1 — React split UI scaffold](../01-local-preview-review/01-scaffold-capability) and keep it as your shared authenticated canvas client.

### Spec canvas UI (`ui/src/mount.tsx`)

```typescript
import { hubJson } from "./lib/hub-client";

const API = "/api/team-brief";

const CSS = `
  :root { font-family: system-ui, sans-serif; }
  .wrap { padding: 16px; max-width: 820px; }
  .badge { font-size: 12px; background: #f3f4f6; padding: 2px 8px; border-radius: 999px; }
  section { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin: 10px 0; }
  h3 { margin: 0 0 6px; font-size: 15px; }
  pre { white-space: pre-wrap; margin: 0; font-size: 13px; }
  button { margin-top: 12px; padding: 8px 14px; border-radius: 6px; border: 0; background: #111; color: #fff; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
`;

interface HostCtx { spaceId: string; instanceId: string; }
interface BriefView {
  brief_key: string;
  state: string;
  title: string;
  summary?: string;
  sections: Array<{ id: string; title: string; body: string; order: number }>;
}

async function load(briefKey: string): Promise<BriefView> {
  return hubJson(`${API}/briefs/get`, {
    method: "POST",
    body: JSON.stringify({ brief_key: briefKey }),
  });
}

function render(root: HTMLElement, ctx: HostCtx, brief: BriefView) {
  const sections = [...brief.sections].sort((a, b) => a.order - b.order);
  root.innerHTML = `
    <style>${CSS}</style>
    <div class="wrap">
      <h1>${brief.title}</h1>
      <p><span class="badge">${brief.state}</span></p>
      ${sections.map((s) => `<section><h3>${s.title}</h3><pre>${s.body}</pre></section>`).join("")}
      <button id="publish" ${brief.state === "pending_publish" ? "" : "disabled"}>Publish</button>
    </div>`;

  root.querySelector("#publish")?.addEventListener("click", async () => {
    await hubJson(`${API}/briefs/publish`, {
      method: "POST",
      body: JSON.stringify({ brief_key: ctx.instanceId }),
    });
    render(root, ctx, await load(ctx.instanceId));
  });
}

export function mount(root: HTMLElement, ctx: HostCtx): () => void {
  void load(ctx.instanceId).then((brief) => render(root, ctx, brief));
  return () => { root.innerHTML = ""; };
}

window.addEventListener("message", (ev) => {
  if (ev.data?.type === "init") mount(document.getElementById("root")!, ev.data.ctx);
  if (ev.data?.type === "reload") window.location.reload();
});
```

### Server (`server/hub.ts` + `server/index.ts`)

Use the same `server/hub.ts` helper as Tutorial 1 (`hubJson` with `STUDIO_HUB_URL` + `STUDIO_TOKEN`).

```typescript
import type { CapabilityServerContext } from "@studio/capability-sdk/server";
import { hubJson } from "./hub.js";

type Ctx = { req: { json: () => unknown }; json: (v: unknown) => unknown };

const publishWait = new Map<string, { status: "resolved"; payload: Record<string, unknown> }>();

function sectionsOf(meta: Record<string, unknown>) {
  return (meta.sections as Record<string, { title: string; body: string; order: number }>) ?? {};
}

export function mountRoutes(app: { post: Function; get: Function; patch: Function }, ctx: CapabilityServerContext) {
  const space = ctx.spaceId;

  app.post("/briefs", async (c: Ctx) => {
    const body = c.req.json() as { title: string };
    const created = await hubJson<{ instance_id: string }>(`/v1/spaces/${space}/instances`, {
      method: "POST",
      json: {
        contract_ref_id: ctx.contractRefId,
        metadata: { title: body.title, version: 1, summary: "", sections: {} },
      },
    });
    return c.json({ brief_key: created.instance_id, state: "gathering" });
  });

  app.post("/briefs/get", async (c: Ctx) => {
    const { brief_key } = c.req.json() as { brief_key: string };
    const inst = await hubJson<{ instance_id: string; state: string; metadata: Record<string, unknown> }>(
      `/v1/spaces/${space}/instances/${brief_key}`,
    );
    const sections = Object.entries(sectionsOf(inst.metadata)).map(([id, s]) => ({ id, ...s }));
    return c.json({
      brief_key,
      state: inst.state,
      title: inst.metadata.title,
      summary: inst.metadata.summary,
      sections,
    });
  });

  app.patch("/briefs/:brief_key/sections/:section_id", async (c: Ctx) => {
    const brief_key = (c as unknown as { req: { param: (k: string) => string } }).req.param("brief_key");
    const section_id = (c as unknown as { req: { param: (k: string) => string } }).req.param("section_id");
    const body = c.req.json() as { title: string; body: string; order: number };
    const inst = await hubJson<{ revision: number; metadata: Record<string, unknown> }>(
      `/v1/spaces/${space}/instances/${brief_key}`,
    );
    const sections = { ...sectionsOf(inst.metadata), [section_id]: body };
    await hubJson(`/v1/spaces/${space}/instances/${brief_key}/metadata`, {
      method: "PATCH",
      json: { expected_revision: inst.revision, patch: { sections } },
    });
    return c.json({ ok: true });
  });

  app.post("/briefs/wait-for-publish", async (c: Ctx) => {
    const { brief_key } = c.req.json() as { brief_key: string };
    const hit = publishWait.get(brief_key);
    if (!hit) return c.json({ status: "pending" });
    publishWait.delete(brief_key);
    return c.json(hit);
  });

  app.post("/briefs/publish", async (c: Ctx) => {
    const { brief_key } = c.req.json() as { brief_key: string };
    const inst = await hubJson<{ revision: number; metadata: Record<string, unknown> }>(
      `/v1/spaces/${space}/instances/${brief_key}`,
    );
    await hubJson(`/v1/spaces/${space}/instances/${brief_key}/transitions`, {
      method: "POST",
      json: { event: "publish", expected_revision: inst.revision, actor_id: "human:publisher" },
    });
    await hubJson(`/v1/spaces/${space}/events`, {
      method: "POST",
      json: {
        instance_id: brief_key,
        event_type: "brief.published",
        payload: {
          brief_key,
          title: inst.metadata.title,
          version: inst.metadata.version ?? 1,
          summary: inst.metadata.summary ?? "",
          published_by: "human:publisher",
          section_count: Object.keys(sectionsOf(inst.metadata)).length,
        },
      },
    });
    const payload = { status: "resolved", state: "published", brief_key, title: inst.metadata.title };
    publishWait.set(brief_key, { status: "resolved", payload });
    return c.json(payload);
  });
}
```

Update MCP paths to flat POST bodies where the worker has no param router:

```json
"patch_section": { "http": { "method": "POST", "path": "/briefs/patch-section" } },
"get_brief": { "http": { "method": "POST", "path": "/briefs/get" } },
"wait_for_publish": { "http": { "method": "POST", "path": "/briefs/wait-for-publish" } }
```

Implement `/briefs/patch-section` as a thin wrapper that reads `brief_key` + `section_id` from JSON.

## 5. Validate, build, push, and apply live

From `~/work/orchestrator/capabilities/team-brief`:

```bash
studio capability validate . --json
studio capability build .
studio capability push --space spc_orchestrator --json
```

Then in Configure:

1. `Configure -> Orchestrator -> Capabilities`
2. Open the new `team-brief` install row
3. Click `Validate`
4. Click `Test`
5. Click `Promote`
6. Click `Apply live`
7. Confirm install state `live`

## Next

[Part 2 — Admin setup →](./02-admin-setup)
