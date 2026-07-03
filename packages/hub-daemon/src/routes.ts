import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { addTokenId } from "@murrmure/hub-core";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import type { DaemonContext } from "./context.js";
import { broadcastSse } from "./context.js";
import { parseBearer, requireToken } from "./auth.js";
import { hasCapability } from "@murrmure/hub-core";
import { resolveTokenCapabilities, requireCapability } from "./routes/config/scopes.js";
import { handleSseSubscribe, journalTypeToSseEvent } from "./sse.js";
import { mountShellStaticRoutes } from "./routes/shell-static.js";
import { mountConfigRoutes } from "./routes/config/index.js";
import { mountFlowStartRoutes } from "./routes/flow-starts.js";
import { mountViewAssetRoutes } from "./routes/views/index.js";
import { mountViewDevRoutes } from "./routes/views/dev.js";
import { mountCrossSpaceRoutes } from "./routes/cross-space/index.js";
import { mountFederationRoutes } from "./routes/federation/index.js";
import { mountTriggerRoutes } from "./routes/triggers/index.js";
import { mountMcpRoutes } from "./routes/mcp/index.js";
import { mountMurrmureRoutes } from "./routes/murrmure/shared-config.js";
import { mountSpaceIndexRoutes } from "./routes/spaces/index.js";
import { mountArtifactRoutes } from "./routes/artifacts/index.js";
import { mountSessionRunRoutes } from "./routes/sessions/index.js";
import { mountGrantV2Routes } from "./routes/grants/index.js";
import { mountExecutorPollRoutes } from "./routes/executor/index.js";
import { mountJournalRoutes } from "./routes/journal/index.js";
import {
  mountGateRoutes,
  mountNotificationRoutes,
  mountMeRoutes,
  mountJournalQueryRoutes,
} from "./routes/phase07/index.js";
import { createOutOfShellService } from "./out-of-shell-service.js";
import { ulid } from "ulid";

function isLocalDevOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function createHubApp(ctx: DaemonContext) {
  const { handler, murrmurePersistence, config, flows, startedAt } = ctx;
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
    flows,
  });

  app.get("/health", (c) => c.json(healthPayload()));
  app.get("/v1/health", (c) => c.json(healthPayload()));

  app.post("/v1/spaces", async (c) => {
    const body = await c.req.json();
    const token = parseBearer(c.req.raw);
    if (!token) return c.json({ code: MURRMURE_DENIAL_CODES.TOKEN_DENIED }, 403);

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

    if (result.http_semantic === 200 && result.body && typeof result.body === "object") {
      const bodyRecord = result.body as Record<string, unknown>;
      if (bodyRecord.space_id) {
        broadcastSse(ctx, {
          event: "space.list_changed",
          data: { space_id: String(bodyRecord.space_id) },
        });
      }
    }

    return c.json(result.body, result.http_semantic as 200);
  });

  app.get("/v1/spaces/:space_id", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const space = await handler.query("space.get", { space_id });
    if (!space) return c.json({ code: "space_not_found" }, 404);
    return c.json(space);
  });

  app.get("/v1/spaces/:space_id/gates", async (c) => {
    const space_id = c.req.param("space_id");
    const instance_id = c.req.query("instance_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const gates = await handler.query("gate.list", { space_id, instance_id });
    return c.json({ gates });
  });

  app.post("/v1/spaces/:space_id/gates/:gate_id/resolve", async (c) => {
    const space_id = c.req.param("space_id");
    const gate_id = c.req.param("gate_id");
    const body = await c.req.json();
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
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

  app.get("/v1/spaces/:space_id/events/emittable", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:read", effective);
    if (capCheck) return capCheck;

    const { buildEmittableEventsCatalog } = await import("@murrmure/hub-core");
    const bare = space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
    const catalog = await buildEmittableEventsCatalog(murrmurePersistence, bare);
    return c.json(catalog);
  });

  app.post("/v1/spaces/:space_id/events", async (c) => {
    const space_id = c.req.param("space_id");
    const body = await c.req.json();
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const eventType = String(body.event_type ?? body.type ?? "");
    const eventId = body.event_id ? String(body.event_id) : `evt_${ulid()}`;
    const rawPayload = (body.payload as Record<string, unknown>) ?? {};
    const normalizedSpaceId = space_id.startsWith("spc_") ? space_id : `spc_${space_id}`;
    const payload =
      typeof rawPayload.source === "string"
        ? rawPayload
        : { ...rawPayload, source: `/spaces/${normalizedSpaceId}` };

    if (!body.instance_id) {
      await ctx.triggerDispatcher.dispatch({
        event_id: eventId,
        event_type: eventType,
        space_id,
        payload,
      });

      const { dispatchHooksFromJournal, journalEventToHookSource } = await import("./hook-dispatch.js");
      await dispatchHooksFromJournal(
        ctx,
        journalEventToHookSource({
          event_id: eventId,
          event_type: eventType,
          space_id,
          payload,
        }),
        { actor_id: auth.actor_id, token_id: auth.token_id },
      ).catch(() => undefined);

      const { matchFlowEventStarts, flowRunDeps } = await import("./flow-scheduler-cron.js");
      const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
      await matchFlowEventStarts(murrmurePersistence, ctx.invokeService, () => flowRunDeps(ctx), {
        event_type: eventType,
        space_id,
        source: `/spaces/${space_id}`,
        actor_id: auth.actor_id,
        token_id: auth.token_id,
        capabilities: effective,
      }).catch(() => undefined);

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
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const events = await handler.query("event.tail", { space_id, from_seq });
    return c.json({ events });
  });

  app.get("/v1/spaces/:space_id/events/subscribe", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    return handleSseSubscribe(c, ctx, space_id);
  });

  app.post("/v1/spaces/:space_id/waits", async (c) => {
    const space_id = c.req.param("space_id");
    const body = await c.req.json();
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
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
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const result = await handler.query("wait.poll", { space_id, wait_id });
    return c.json(result);
  });

  app.get("/v1/spaces/:space_id/audit/export", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
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
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    return c.json({
      grant_inventory_drift: [],
      relay_routing_drift: [],
      anomalies: [],
    });
  });

  mountFlowStartRoutes(app, ctx);
  mountViewAssetRoutes(app, ctx);
  mountViewDevRoutes(app, ctx);
  mountSpaceIndexRoutes(app, ctx);
  mountExecutorPollRoutes(app, ctx, ctx.executorPollStore);
  mountArtifactRoutes(app, ctx);
  mountSessionRunRoutes(app, ctx);
  mountGrantV2Routes(app, ctx);
  mountJournalRoutes(app, ctx);
  mountGateRoutes(app, ctx);
  mountNotificationRoutes(app, ctx);
  mountMeRoutes(app, ctx);
  mountJournalQueryRoutes(app, ctx);
  mountConfigRoutes(app, ctx);
  mountMurrmureRoutes(app, ctx);
  mountCrossSpaceRoutes(app, ctx);
  mountFederationRoutes(app, ctx);
  mountTriggerRoutes(app, ctx);
  mountMcpRoutes(app, ctx);
  mountShellStaticRoutes(app, ctx);

  return app;
}

export function startHttpServer(ctx: DaemonContext) {
  const app = createHubApp(ctx);
  return serve({
    fetch: app.fetch,
    port: ctx.config.port,
    hostname: ctx.config.listenHost ?? "127.0.0.1",
  });
}

export { parseBearer, addTokenId };
