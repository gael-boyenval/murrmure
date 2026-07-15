import type { Hono } from "hono";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireScope, requireAnyScope } from "../config/scopes.js";
import { bareSpaceId } from "../../space-id.js";

export function mountArtifactRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence, artifactService } = ctx;

  app.put("/v1/artifacts", async (c) => {
    const sourceSpaceId = c.req.header("x-murrmure-space-id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, sourceSpaceId);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "blob:write");
    if (scopeCheck) return scopeCheck;

    const readersHeader = c.req.header("x-murrmure-authorized-readers") ?? "";
    const ttlDaysHeader = c.req.header("x-murrmure-ttl-days");
    const metadata = {
      space_id: sourceSpaceId,
      name: c.req.header("x-murrmure-name") ?? undefined,
      authorized_readers: readersHeader
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      hold: c.req.header("x-murrmure-hold") === "true" ? true : undefined,
      ttl_days: ttlDaysHeader ? Number(ttlDaysHeader) : undefined,
      transfer_id: c.req.header("x-murrmure-transfer-id") ?? undefined,
    };

    const bytes = Buffer.from(await c.req.raw.arrayBuffer());
    const result = await artifactService.putArtifact({
      bytes,
      metadata,
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
  // ACL, enforced inside `serveArtifactBytes` alongside expiry and digest
  // checks.
  //
  // The ACL principal is bound to the credential, not a caller-supplied
  // `?space_id=` (parity with the `artifacts_in` path, where the principal is
  // the authenticated invoke context). A federated resolve token carries a
  // persisted `consumer_space_id` binding (set by the producer when minting the
  // token for a `remote_hub` dispatch); the claimed `space_id` must match that
  // binding. A same-space `blob:read` / `step:resolve` token (no consumer
  // binding) may only read its own space's artifacts. A bootstrap or
  // wrong-space credential is rejected with 403 `ARTIFACT_ACCESS_DENIED` before
  // any bytes are read — a caller may no longer claim another ACL-authorized
  // space by supplying an arbitrary `?space_id=`. Reachable with `blob:read` or
  // a federated `step:resolve` credential.
  app.get("/v1/artifacts/:transfer_id/bytes", async (c) => {
    const transfer_id = c.req.param("transfer_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireAnyScope(auth, ["blob:read", "step:resolve"]);
    if (scopeCheck) return scopeCheck;

    const claimedSpaceId = c.req.query("space_id");
    if (!claimedSpaceId) {
      return c.json({ code: "INVALID_REQUEST", message: "space_id query parameter is required" }, 400);
    }

    // Bind the ACL principal to the credential. A consumer-bound resolve token
    // must claim its bound consumer space; an unbound token may only claim its
    // own space. Anything else is a wrong-space claim → 403.
    let requesterSpaceId: string;
    if (auth.consumer_space_id) {
      if (bareSpaceId(claimedSpaceId) !== bareSpaceId(auth.consumer_space_id)) {
        return c.json(
          {
            code: "ARTIFACT_ACCESS_DENIED",
            message: "Token is not bound to the requested consumer space",
          },
          403,
        );
      }
      requesterSpaceId = auth.consumer_space_id;
    } else if (auth.space_id !== "bootstrap" && bareSpaceId(claimedSpaceId) === bareSpaceId(auth.space_id)) {
      requesterSpaceId = claimedSpaceId;
    } else {
      return c.json(
        {
          code: "ARTIFACT_ACCESS_DENIED",
          message: "Token is not authorized for the requested consumer space",
        },
        403,
      );
    }

    const result = await artifactService.serveArtifactBytes({
      transfer_id,
      requester_space_id: requesterSpaceId,
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
