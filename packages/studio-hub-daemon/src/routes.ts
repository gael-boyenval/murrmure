import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { HubHandler } from "@murrmure/hub-core";
import { addTokenId } from "@murrmure/hub-core";
import { STUDIO_DENIAL_CODES } from "@murrmure/contracts";
import type { DaemonContext } from "./context.js";
import { broadcastSse } from "./context.js";
import { parseBearer, requireToken } from "./auth.js";
import { handleSseSubscribe, journalTypeToSseEvent } from "./sse.js";
import { mountFlowStaticRoutes } from "./routes/flow-static.js";
import { mountCapabilities } from "./mount.js";
import { mountConfigRoutes } from "./routes/config/index.js";
import { mountFlowRuntimeRoutes } from "./routes/flows/index.js";
import { mountCrossSpaceRoutes } from "./routes/cross-space/index.js";
import { mountTriggerRoutes } from "./routes/triggers/index.js";
import { mountMcpRoutes } from "./routes/mcp/index.js";
import { mountStudioRoutes } from "./routes/studio/shared-config.js";
import { ulid } from "ulid";
import { MountRegistry } from "./mount-registry.js";
import { McpToolRegistry } from "./mcp-tool-registry.js";
import { ControlBus } from "./control-bus.js";
import { McpWakeDispatcher } from "./mcp-wake-dispatcher.js";
import { CapabilityWorkerPool } from "./capability-worker-pool.js";
import { mountHostBridgeRoutes } from "./host-bridge.js";
import { TriggerDispatcher } from "./trigger-dispatcher.js";

function isLocalDevOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function createHubApp(ctx: DaemonContext) {
  const { handler, studioPersistence, config, capabilities, startedAt } = ctx;
  const app = new Hono();

  app.use("*", async (c, next) => {
    const origin = c.req.header("Origin");
    if (origin && isLocalDevOrigin(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
      c.header("Vary", "Origin");
    }
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    await next();
  });

  const healthPayload = () => ({
    status: "ok",
    version: "0.1.0",
    uptime_s: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    capabilities,
  });

  app.get("/health", (c) => c.json(healthPayload()));
  app.get("/v1/health", (c) => c.json(healthPayload()));

  app.post("/v1/spaces", async (c) => {
    const body = await c.req.json();
    const token = parseBearer(c.req.raw);
    if (!token) return c.json({ code: STUDIO_DENIAL_CODES.TOKEN_DENIED }, 403);

    const result = await handler.execute({
      kind: "space.create",
      provenance: {
        space_id: token,
        actor_id: body.actor_id ?? "actor_bootstrap",
        token_id: token,
        command_id: c.req.header("Idempotency-Key") ?? undefined,
      },
      slug: body.slug,
      name: body.name,
      install_policy: body.install_policy,
      preview_policy: body.preview_policy,
      description: body.description,
      parent_space_id: body.parent_space_id,
    } as never);
    return c.json(result.body, result.http_semantic as 200);
  });

  app.get("/v1/spaces/:space_id", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const space = await handler.query("space.get", { space_id });
    if (!space) return c.json({ code: "space_not_found" }, 404);
    return c.json(space);
  });

  app.get("/v1/spaces/:space_id/instances", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const instances = await handler.query("instance.list", { space_id });
    return c.json({ instances });
  });

  app.get("/v1/spaces/:space_id/instances/:instance_id", async (c) => {
    const space_id = c.req.param("space_id");
    const instance_id = c.req.param("instance_id");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const instance = await handler.query("instance.get", { space_id, instance_id });
    if (!instance) return c.json({ code: "instance_not_found" }, 404);
    return c.json(instance);
  });

  app.patch("/v1/spaces/:space_id/instances/:instance_id/metadata", async (c) => {
    const space_id = c.req.param("space_id");
    const instance_id = c.req.param("instance_id");
    const body = await c.req.json();
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const result = await handler.execute({
      kind: "instance.metadata.patch",
      provenance: {
        space_id,
        instance_id,
        actor_id: body.actor_id ?? auth.actor_id,
        token_id: auth.token_id,
        command_id: c.req.header("Idempotency-Key") ?? undefined,
      },
      patch: body.patch ?? body,
      expected_revision: body.expected_revision,
    });
    return c.json(result.body, result.http_semantic as 200);
  });

  app.post("/v1/spaces/:space_id/instances", async (c) => {
    const space_id = c.req.param("space_id");
    const body = await c.req.json();
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const result = await handler.execute({
      kind: "instance.create",
      provenance: {
        space_id,
        actor_id: body.actor_id ?? auth.actor_id,
        token_id: auth.token_id,
        command_id: c.req.header("Idempotency-Key") ?? undefined,
      },
      contract_ref_id: body.contract_ref_id,
      metadata: body.metadata,
    });
    return c.json(result.body, result.http_semantic as 200);
  });

  app.post("/v1/spaces/:space_id/instances/:instance_id/transitions", async (c) => {
    const space_id = c.req.param("space_id");
    const instance_id = c.req.param("instance_id");
    const body = await c.req.json();
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const result = await handler.execute({
      kind: "state.transition",
      provenance: {
        space_id,
        instance_id,
        actor_id: body.actor_id ?? auth.actor_id,
        token_id: auth.token_id,
        command_id: c.req.header("Idempotency-Key") ?? undefined,
      },
      event: body.event,
      payload: body.payload,
      expected_revision: body.expected_revision,
    });

    if (result.body.checkpoint_id || result.body.gate_id) {
      broadcastSse(ctx, {
        event: "gate.pending",
        data: {
          gate_id: result.body.gate_id ?? result.body.checkpoint_id,
          instance_id,
          assignees: [],
        },
      });
    }

    return c.json(result.body, result.http_semantic as 200);
  });

  app.get("/v1/spaces/:space_id/gates", async (c) => {
    const space_id = c.req.param("space_id");
    const instance_id = c.req.query("instance_id");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const gates = await handler.query("gate.list", { space_id, instance_id });
    return c.json({ gates });
  });

  app.post("/v1/spaces/:space_id/gates/:gate_id/resolve", async (c) => {
    const space_id = c.req.param("space_id");
    const gate_id = c.req.param("gate_id");
    const body = await c.req.json();
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const result = await handler.execute({
      kind: "gate.resolve",
      provenance: {
        space_id,
        instance_id: body.instance_id,
        actor_id: body.actor_id ?? auth.actor_id,
        token_id: auth.token_id,
      },
      gate_id,
      decision: body.decision,
    });

    broadcastSse(ctx, {
      event: "gate.resolved",
      data: { gate_id, decision: body.decision },
    });

    return c.json(result.body, result.http_semantic as 200);
  });

  app.post("/v1/spaces/:space_id/events", async (c) => {
    const space_id = c.req.param("space_id");
    const body = await c.req.json();
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const eventType = String(body.event_type ?? body.type ?? "");
    const eventId = `evt_${ulid()}`;

    if (!body.instance_id) {
      await ctx.triggerDispatcher.dispatch({
        event_id: eventId,
        event_type: eventType,
        space_id,
        payload: (body.payload as Record<string, unknown>) ?? {},
      });
      return c.json({ event_id: eventId, type: eventType, seq: 1 });
    }

    const result = await handler.execute({
      kind: "event.append",
      provenance: {
        space_id,
        instance_id: body.instance_id,
        actor_id: body.actor_id ?? auth.actor_id,
        token_id: auth.token_id,
      },
      event_type: eventType,
      payload: body.payload,
    });
    return c.json({ ...result.body, event_id: eventId }, result.http_semantic as 200);
  });

  app.get("/v1/spaces/:space_id/events", async (c) => {
    const space_id = c.req.param("space_id");
    const from_seq = Number(c.req.query("from_seq") ?? "0");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const events = await handler.query("event.tail", { space_id, from_seq });
    return c.json({ events });
  });

  app.get("/v1/spaces/:space_id/events/subscribe", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    return handleSseSubscribe(c, ctx, space_id);
  });

  app.post("/v1/spaces/:space_id/waits", async (c) => {
    const space_id = c.req.param("space_id");
    const body = await c.req.json();
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const result = await handler.execute({
      kind: "wait.register",
      provenance: {
        space_id,
        instance_id: body.instance_id,
        actor_id: body.actor_id ?? auth.actor_id,
        token_id: auth.token_id,
      },
      condition: body.condition,
      delivery_mode: "in_process",
      bound_command_id: body.bound_command_id,
    });
    return c.json(result.body, result.http_semantic as 200);
  });

  app.get("/v1/spaces/:space_id/waits/:wait_id", async (c) => {
    const space_id = c.req.param("space_id");
    const wait_id = c.req.param("wait_id");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const result = await handler.query("wait.poll", { space_id, wait_id });
    return c.json(result);
  });

  app.get("/v1/spaces/:space_id/audit/export", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const since = c.req.query("since");
    const until = c.req.query("until");
    const instance_id = c.req.query("instance_id");
    const from_seq = since ? Number(since) : 0;

    const result = await handler.query("audit.export", {
      space_id,
      from_seq,
      filter: instance_id ? { instance_id } : undefined,
    });

    const events = (result as { events: Array<Record<string, unknown>> }).events;
    const lines = events.map((e) => JSON.stringify(e)).join("\n");
    return new Response(lines + (lines ? "\n" : ""), {
      headers: { "content-type": "application/x-ndjson" },
    });
  });

  app.get("/v1/spaces/:space_id/ops/drift", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    return c.json({
      grant_inventory_drift: [],
      relay_routing_drift: [],
      anomalies: [],
    });
  });

  mountHostBridgeRoutes(app, ctx);

  // Dynamic dispatcher for bundle capability workers.
  app.all("/api/*", async (c, next) => {
    const url = new URL(c.req.url);
    const path = url.pathname;
    const mount = ctx.mountRegistry
      .listAll()
      .find(
        (m) =>
          m.bundle_digest &&
          (path === m.routes_prefix || path.startsWith(`${m.routes_prefix}/`)),
      );
    if (!mount?.bundle_digest) return next();
    const worker = ctx.workerPool.get(mount.package_id, mount.bundle_digest);
    if (!worker) return next();

    const target = `http://127.0.0.1:${worker.port}${path}${url.search}`;
    const res = await fetch(target, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.method === "GET" || c.req.method === "HEAD" ? undefined : await c.req.arrayBuffer(),
    });
    return new Response(res.body, { status: res.status, headers: res.headers });
  });

  // Runtime routes own the literal `/flows/live` route; mount them
  // before the config routes whose `/flows/:install_id` param route
  // would otherwise shadow it.
  mountFlowRuntimeRoutes(app, ctx);
  mountConfigRoutes(app, ctx);
  mountStudioRoutes(app, ctx);
  mountCrossSpaceRoutes(app, ctx);
  mountTriggerRoutes(app, ctx);
  mountMcpRoutes(app, ctx);
  mountCapabilities(app, ctx);
  mountFlowStaticRoutes(app, ctx);

  return app;
}

export function startHttpServer(ctx: DaemonContext) {
  const app = createHubApp(ctx);
  return serve({ fetch: app.fetch, port: ctx.config.port });
}

/** @deprecated use createHubApp with DaemonContext */
export function createLegacyHubApp(handler: HubHandler) {
  const mountRegistry = new MountRegistry();
  const studioPersistence = { getToken: async () => null } as never;
  const mcpToolRegistry = new McpToolRegistry(mountRegistry, studioPersistence);
  const controlBus = new ControlBus();
  const mcpWakeDispatcher = new McpWakeDispatcher(controlBus, handler);
  return createHubApp({
    handler,
    studioPersistence,
    config: {
      databasePath: "",
      port: 8787,
      dataDir: "",
      defaultSpaceId: "",
    },
    capabilities: ["platform"],
    startedAt: new Date(),
    sseSubscribers: new Set(),
    mountRegistry,
    mcpToolRegistry,
    controlBus,
    mcpWakeDispatcher,
    triggerDispatcher: new TriggerDispatcher(studioPersistence, mcpWakeDispatcher, handler),
    workerPool: new CapabilityWorkerPool(),
  });
}

export { parseBearer, addTokenId };
