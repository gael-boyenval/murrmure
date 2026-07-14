import type { Hono } from "hono";
import type { Capability } from "@murrmure/contracts";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireScope, provenanceFrom } from "../config/scopes.js";
import { bareSpaceId, prefixedSpaceId } from "../../space-id.js";

export function mountGrantV2Routes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence, handler } = ctx;

  app.post("/v1/grants", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;

    const body = await c.req.json();
    const space_id = prefixedSpaceId(bareSpaceId(String(body.space_id ?? auth.space_id)));
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const rawCaps = body.capabilities as Capability[] | undefined;
    const result = await handler.config.mintGrant(
      space_id,
      {
        label: String(body.label ?? "agent"),
        harness: body.harness,
        scopes: body.scopes,
        capabilities: rawCaps,
        template: body.template,
        profile: body.profile,
        flow_acl: body.flow_acl,
        expires_in_days: body.expires_in_days,
      },
      provenanceFrom(auth, space_id, c.req.header("Idempotency-Key") ?? undefined),
    );

    return c.json(result.body, result.http_semantic as 200);
  });

  app.get("/v1/grants", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const space_id = c.req.query("space_id");
    if (!space_id) {
      return c.json({ code: "INVALID_REQUEST", message: "space_id query required" }, 400);
    }

    const grants = await handler.config.listGrants(prefixedSpaceId(bareSpaceId(space_id)));
    return c.json({ grants });
  });

  app.delete("/v1/grants/:grant_id", async (c) => {
    const grant_id = c.req.param("grant_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const space_id = c.req.query("space_id");
    if (!space_id) {
      return c.json({ code: "INVALID_REQUEST", message: "space_id query required" }, 400);
    }

    const result = await handler.config.revokeGrant(prefixedSpaceId(bareSpaceId(space_id)), grant_id);
    return c.json(result);
  });
}
