import type { Hono } from "hono";
import {
  buildSpaceHome,
  sanitizeFlowPreview,
  startFlowRun,
  canReadFlow,
} from "@murrmure/hub-core";
import type { DaemonContext } from "../context.js";
import { requireToken, type TokenContext } from "../auth.js";
import { requireCapability, resolveTokenCapabilities } from "./config/scopes.js";
import { bareSpaceId, prefixedSpaceId } from "../space-id.js";
import { dispatchFlowSteps } from "../flow-dispatch.js";
import { flowRunDeps } from "../flow-scheduler-cron.js";

function flowRunDepsFromCtx(ctx: DaemonContext) {
  return flowRunDeps(ctx);
}

async function runFlowHandler(
  ctx: DaemonContext,
  auth: TokenContext,
  flow_id: string,
  body: Record<string, unknown>,
  idempotencyHeader?: string,
) {
  const effective = await resolveTokenCapabilities(ctx.murrmurePersistence, auth);
  const capCheck = requireCapability(auth, "flow:run", effective);
  if (capCheck) return capCheck;

  const space_id = body.space_id
    ? prefixedSpaceId(bareSpaceId(String(body.space_id)))
    : auth.space_id !== "bootstrap"
      ? prefixedSpaceId(bareSpaceId(auth.space_id))
      : undefined;

  if (!space_id) {
    return new Response(JSON.stringify({ code: "SPACE_REQUIRED", message: "space_id required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const scopedSpaceId = bareSpaceId(space_id);
  const entry = await ctx.murrmurePersistence.getFlowIndexEntry(flow_id, scopedSpaceId);
  if (!entry) {
    return new Response(JSON.stringify({ code: "FLOW_NOT_FOUND", message: "Flow not indexed" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const input =
    body.input && typeof body.input === "object" ? (body.input as Record<string, unknown>) : {};

  const result = await startFlowRun(flowRunDepsFromCtx(ctx), {
    entry,
    space_id,
    actor_id: auth.actor_id,
    token_id: auth.token_id,
    capabilities: effective,
    flow_acl: auth.flow_acl,
    input,
    session_id: body.session_id ? String(body.session_id) : undefined,
    idempotency_header: body.idempotency_key
      ? String(body.idempotency_key)
      : idempotencyHeader,
    mode: "manual",
  });

  if (!result.ok) {
    const status =
      result.error.code === "SCOPE_ENFORCEMENT_FAILURE"
        ? 403
        : result.error.code === "FLOW_NOT_FOUND"
          ? 404
          : result.error.code === "FLOW_CONCURRENCY_LIMIT"
            ? 409
            : 400;
    return new Response(JSON.stringify(result.error), { status, headers: { "content-type": "application/json" } });
  }

  if (!result.deduplicated && result.dispatch.length) {
    await dispatchFlowSteps(ctx.invokeService, {
      dispatch: result.dispatch,
      session_id: result.session.session_id,
      run_id: result.run_id,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
    });
  } else if (!result.deduplicated) {
    const { bootstrapFlowRunSteps } = await import("../flow-advance.js");
    await bootstrapFlowRunSteps(ctx, {
      run_id: result.run_id,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
    });
  }

  return new Response(
    JSON.stringify({
      session: result.session,
      run_id: result.run_id,
      flow_digest: result.flow_digest,
      deduplicated: result.deduplicated ?? false,
    }),
    { status: result.deduplicated ? 200 : 201, headers: { "content-type": "application/json" } },
  );
}

export function mountFlowStartRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.post("/v1/flows/:flow_id/run", async (c) => {
    const flow_id = c.req.param("flow_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const body = await c.req.json().catch(() => ({}));
    return runFlowHandler(ctx, auth, flow_id, body, c.req.header("Idempotency-Key") ?? undefined);
  });

  app.get("/v1/spaces/:space_id/home", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:read", effective);
    if (capCheck) return capCheck;

    const home = await buildSpaceHome(murrmurePersistence, {
      space_id: prefixedSpaceId(bareSpaceId(space_id)),
      actor_id: auth.actor_id,
      capabilities: effective,
      flow_acl: auth.flow_acl,
    });
    return c.json(home);
  });

  app.get("/v1/spaces/:space_id/flows/:flow_id/preview", async (c) => {
    const space_id = c.req.param("space_id");
    const flow_id = c.req.param("flow_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    if (!canReadFlow(effective)) {
      return c.json({ code: "SCOPE_ENFORCEMENT_FAILURE", message: "flow:read required" }, 403);
    }

    const entry = await murrmurePersistence.getFlowIndexEntry(flow_id, bareSpaceId(space_id));
    if (!entry) return c.json({ code: "flow_not_found", message: "Flow not indexed" }, 404);

    return c.json(sanitizeFlowPreview(entry));
  });
}

export { runFlowHandler, flowRunDepsFromCtx };
