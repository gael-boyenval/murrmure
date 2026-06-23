import type { Hono } from "hono";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireScope } from "../config/scopes.js";
import { executeCrossSpaceAsk } from "../../cross-space-query.js";

export function mountCrossSpaceRoutes(app: Hono, ctx: DaemonContext): void {
  const { studioPersistence, handler } = ctx;

  app.post("/v1/spaces/:space_id/queries/ask", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const body = await c.req.json();
    const result = await executeCrossSpaceAsk(handler, ctx, studioPersistence, space_id, auth.actor_id, {
      target_space_id: String(body.target_space_id ?? ""),
      query_type: String(body.query_type ?? ""),
      params: (body.params as Record<string, unknown>) ?? {},
      timeout_ms: body.timeout_ms as number | undefined,
    });

    if (!result.ok) {
      return c.json(
        { query_id: result.query_id, status: result.status, reason: result.reason },
        result.http_status as 403,
      );
    }

    return c.json({
      query_id: result.query_id,
      status: result.status,
      data: result.data,
      _attribution: result._attribution,
    });
  });

  app.get("/v1/spaces/:space_id/queries/:query_id", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const query = await studioPersistence.getQuery(c.req.param("query_id"));
    if (!query) return c.json({ code: "not_found" }, 404);
    return c.json(query);
  });
}
