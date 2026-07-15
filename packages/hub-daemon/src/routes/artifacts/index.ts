import type { Hono } from "hono";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireScope, requireAnyScope } from "../config/scopes.js";
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

  // Producer-side artifact bytes endpoint for federated consumers. A
  // destination hub fetches relayed artifact references by `transfer_id`
  // through this route using the relayed `hub_token` / `hub_url`, then
  // materializes verified consumer copies in its own space — without
  // destination pre-seeding. Authorization is the artifact `authorized_readers`
  // ACL (the requester `space_id` must be listed), enforced inside
  // `serveArtifactBytes` alongside expiry and digest checks. The token's own
  // space boundary is intentionally not re-checked here: a cross-hub fetch
  // legitimately presents a producer-space credential (e.g. a relayed
  // `step:resolve` token) while requesting bytes authorized to the consumer
  // space, so the ACL is the authoritative gate. Reachable with `blob:read` or
  // a federated `step:resolve` credential.
  app.get("/v1/artifacts/:transfer_id/bytes", async (c) => {
    const transfer_id = c.req.param("transfer_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireAnyScope(auth, ["blob:read", "step:resolve"]);
    if (scopeCheck) return scopeCheck;

    const spaceId =
      c.req.query("space_id") ??
      (auth.space_id !== "bootstrap" ? `spc_${bareSpaceId(auth.space_id)}` : undefined);
    if (!spaceId) {
      return c.json({ code: "INVALID_REQUEST", message: "space_id query parameter is required" }, 400);
    }

    const result = await artifactService.serveArtifactBytes({
      transfer_id,
      requester_space_id: spaceId,
      requester_actor_id: auth.actor_id,
    });
    if (result.http !== 200) {
      return c.json(result.body, result.http);
    }
    return new Response(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "x-murrmure-digest": result.digest,
        "x-murrmure-name": result.name,
      },
    });
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
