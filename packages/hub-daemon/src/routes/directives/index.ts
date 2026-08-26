import type { Hono } from "hono";
import { hasCapability, listEligibleDirectiveSpaces } from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireCapability, resolveTokenCapabilities } from "../config/scopes.js";

export function mountDirectiveRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.get("/v1/directives/eligible", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const readCheck = requireCapability(auth, "space:read", effective);
    if (readCheck) return readCheck;

    const bootstrap = auth.space_id === "bootstrap" || hasCapability(effective, "hub:admin");
    const spaces = await listEligibleDirectiveSpaces(
      murrmurePersistence,
      bootstrap ? undefined : { space_id: auth.space_id },
    );
    return c.json({ spaces });
  });
}
