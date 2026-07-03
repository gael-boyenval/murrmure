import type { Hono } from "hono";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireScope } from "../config/scopes.js";
import { bareSpaceId } from "../../space-id.js";

export function mountArtifactRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence, artifactService } = ctx;

  app.put("/v1/artifacts", async (c) => {
    const body = await c.req.json();
    const sourceSpaceId = typeof body?.space_id === "string" ? body.space_id : undefined;
    const auth = await requireToken(murrmurePersistence, c.req.raw, sourceSpaceId);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "blob:write");
    if (scopeCheck) return scopeCheck;
    const result = await artifactService.putArtifact({
      body,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
    });
    return c.json(result.body, result.http);
  });

  app.get("/v1/artifacts/:transfer_id", async (c) => {
    const transfer_id = c.req.param("transfer_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, c.req.query("space_id") ?? undefined);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "blob:read");
    if (scopeCheck) return scopeCheck;

    const spaceId =
      c.req.query("space_id") ??
      (auth.space_id !== "bootstrap" ? `spc_${bareSpaceId(auth.space_id)}` : undefined);
    if (!spaceId) {
      return c.json({ code: "INVALID_REQUEST", message: "space_id query parameter is required" }, 400);
    }

    const result = await artifactService.getArtifact({
      transfer_id,
      requester_space_id: spaceId,
      requester_actor_id: auth.actor_id,
    });
    return c.json(result.body, result.http);
  });

  app.post("/v1/artifacts/:transfer_id/materialize", async (c) => {
    const transfer_id = c.req.param("transfer_id");
    const body = await c.req.json();
    const targetSpaceId = typeof body?.space_id === "string" ? body.space_id : undefined;
    if (!targetSpaceId) {
      return c.json({ code: "INVALID_REQUEST", message: "space_id is required" }, 400);
    }
    const auth = await requireToken(murrmurePersistence, c.req.raw, targetSpaceId);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "blob:read");
    if (scopeCheck) return scopeCheck;
    const result = await artifactService.materializeArtifact({
      transfer_id,
      body,
      requester_actor_id: auth.actor_id,
    });
    return c.json(result.body, result.http);
  });
}
