import type { Hono } from "hono";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireScope } from "../config/scopes.js";
import { requirePeerAuth } from "../../federation-wire.js";

export function mountFederationRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence, federationPort } = ctx;

  app.post("/v1/ops/federation/peers", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const body = await c.req.json();
    const hub_id = String(body.hub_id ?? body.id ?? "");
    const endpoint = String(body.url ?? body.endpoint ?? "");
    if (!hub_id || !endpoint) {
      return c.json({ code: "INVALID_PEER", message: "hub_id and url are required" }, 400);
    }

    const peer = await federationPort.registerPeer({
      hub_id,
      endpoint,
      auth_token: typeof body.auth_token === "string" ? body.auth_token : undefined,
      routing: (body.routing as Record<string, unknown>) ?? {},
    });

    return c.json({ peer });
  });

  app.get("/v1/ops/federation/peers", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const peers = await federationPort.listPeers();
    return c.json({ peers });
  });

  app.post("/v1/federation/ingress", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const body = await c.req.json();
    const result = await federationPort.ingestEvent({
      source_hub_id: String(body.source_hub_id ?? ""),
      event_id: String(body.event_id ?? ""),
      event_type: String(body.event_type ?? body.type ?? ""),
      space_id: String(body.space_id ?? ""),
      payload: (body.payload as Record<string, unknown>) ?? {},
      federation: body.federation as
        | { origin_hub_id: string; origin_seq?: number; ingress?: boolean }
        | undefined,
    });

    if (!result.accepted) {
      return c.json({ accepted: false, reason: result.reason }, 400);
    }

    return c.json(result);
  });

  // Federation relay ingress: a peer hub relays an invoke to a space bound to
  // this hub. This is internal hub-to-hub dispatch (invokeService used
  // privately), NOT the removed public action-invoke route. Authz requires a
  // registered federation peer credential — ordinary space-connection
  // `flow:run` tokens are rejected with 403 FEDERATION_PEER_DENIED.
  app.post(
    "/v1/federation/relay/spaces/:space_id/actions/:action_name/invoke",
    async (c) => {
      const space_id = c.req.param("space_id");
      const action_name = c.req.param("action_name");
      const peer = await requirePeerAuth(federationPort, c.req.raw);
      if (peer instanceof Response) return peer;

      const body = await c.req.json().catch(() => ({}));
      const result = await ctx.invokeService.invokeAction({
        space_id,
        action_name,
        body,
        idempotency_header: c.req.header("Idempotency-Key") ?? undefined,
        actor_id: peer.actor_id,
        token_id: peer.token_id,
      });
      return c.json(result.body, result.http);
    },
  );
}
