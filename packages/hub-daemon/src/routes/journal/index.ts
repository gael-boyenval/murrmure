import type { Hono } from "hono";
import type { Context } from "hono";
import { hasCapability } from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken, type TokenContext } from "../../auth.js";
import { resolveTokenCapabilities } from "../config/scopes.js";
import { handleSseSubscribe } from "../../sse.js";
import { mintSseTicket, resolveSseTicket } from "../../sse-ticket.js";
import { stripTokenId } from "@murrmure/hub-core";

async function resolveJournalAuth(
  c: Context,
  ctx: DaemonContext,
): Promise<TokenContext | Response> {
  const ticket = c.req.query("ticket");
  if (ticket) {
    const tokenId = resolveSseTicket(ticket);
    if (!tokenId) {
      return c.json({ code: "INVALID_TICKET", message: "SSE ticket expired or invalid" }, 401);
    }
    const token = await ctx.murrmurePersistence.getToken(stripTokenId(tokenId));
    if (!token || token.status !== "active") {
      return c.json({ code: "INVALID_TICKET", message: "SSE ticket expired or invalid" }, 401);
    }
    return {
      token_id: tokenId,
      actor_id: token.actor_id,
      space_id: token.space_id,
      scopes: token.scopes,
      harness_id: token.harness_id,
      flow_acl: token.flow_acl,
    };
  }

  return requireToken(ctx.murrmurePersistence, c.req.raw);
}

export function mountJournalRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.post("/v1/auth/sse-ticket", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;

    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    if (!hasCapability(effective, ["space:read", "journal:read"])) {
      return c.json(
        { code: "SCOPE_ENFORCEMENT_FAILURE", message: "space:read or journal:read required" },
        403,
      );
    }

    const ticket = mintSseTicket(auth.token_id);
    return c.json({ ticket, expires_in: 60 });
  });

  app.get("/v1/journal/subscribe", async (c) => {
    const auth = await resolveJournalAuth(c, ctx);
    if (auth instanceof Response) return auth;

    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    if (!hasCapability(effective, ["space:read", "journal:read"])) {
      return c.json(
        { code: "SCOPE_ENFORCEMENT_FAILURE", message: "space:read or journal:read required" },
        403,
      );
    }

    return handleSseSubscribe(c, ctx);
  });
}
