import type { Hono } from "hono";
import { listStepContractsForRun } from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireCapability, resolveTokenCapabilities } from "../config/scopes.js";

export function mountStepContractsRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.get("/v1/runs/:run_id/step-contracts", async (c) => {
    const run_id = c.req.param("run_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;

    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const scopeCheck = requireCapability(auth, "space:read", effective);
    if (scopeCheck) return scopeCheck;

    const result = await listStepContractsForRun(murrmurePersistence, run_id);
    if ("code" in result) {
      const status = result.code === "RUN_NOT_FOUND" ? 404 : 409;
      return c.json({ code: result.code, message: result.message }, status);
    }

    return c.json(result);
  });
}
