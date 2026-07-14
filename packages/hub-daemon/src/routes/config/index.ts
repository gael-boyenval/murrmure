import type { Hono } from "hono";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { actorKind, denialResponse, hasScope, provenanceFrom, requireScope } from "./scopes.js";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import { normalizeTriggerBody } from "../triggers/index.js";

export function mountConfigRoutes(app: Hono, ctx: DaemonContext) {
  const { handler, murrmurePersistence } = ctx;
  const config = handler.config;

  app.get("/v1/auth/whoami", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const whoami = await handler.query("auth.whoami", {
      space_id: auth.space_id,
      token_id: auth.token_id,
    });
    if (!whoami) return c.json({ code: MURRMURE_DENIAL_CODES.TOKEN_DENIED, message: "Invalid token" }, 403);
    return c.json(whoami);
  });

  app.get("/v1/spaces", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:enter");
    if (scopeCheck) return scopeCheck;

    if (auth.space_id === "bootstrap") {
      const all = await config.querySpaceList([]);
      const spaces = (all as Array<{ space_id: string }>).map((s) => ({
        ...s,
        scopes: auth.scopes,
      }));
      return c.json({ spaces });
    }

    const allSpaces = await config.querySpaceList([
      { space_id: `spc_${auth.space_id}`, scopes: auth.scopes },
    ]);
    return c.json({ spaces: allSpaces });
  });

  app.patch("/v1/spaces/:space_id", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const body = await c.req.json();
    const space = await config.updateSpace(space_id, body);
    if (!space) return c.json({ code: "space_not_found", message: "Space not found" }, 404);
    return c.json(space);
  });

  app.post("/v1/spaces/:space_id/archive", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const result = await config.archiveSpace(space_id);
    if (result.outcome === "denial") {
      return c.json({ code: result.code, ...result.body }, result.http_semantic as 403);
    }
    return c.json(result.body, result.http_semantic as 200);
  });

  app.get("/v1/spaces/:space_id/flows", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const installs = await config.listCapabilities(space_id);
    return c.json({ flows: installs });
  });

  app.get("/v1/spaces/:space_id/flows/:install_id", async (c) => {
    const space_id = c.req.param("space_id");
    const install_id = c.req.param("install_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const install = await config.getCapability(space_id, install_id);
    if (!install) return c.json({ code: "not_found", message: "Install not found" }, 404);
    return c.json(install);
  });

  app.get("/v1/spaces/:space_id/flows/:install_id/source", async (c) => {
    return c.json({ code: "source_not_found", message: "Source snapshots are not stored by the Hub" }, 404);
  });

  app.get("/v1/spaces/:space_id/contracts/diff", async (c) => {
    const space_id = c.req.param("space_id");
    const from = c.req.query("from") ?? "2.0.0";
    const to = c.req.query("to") ?? "3.0.0";
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const diff = await config.contractDiff(space_id, from, to);
    return c.json(diff);
  });

  app.get("/v1/spaces/:space_id/members", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const members = await config.listMembers(space_id);
    return c.json({ members });
  });

  app.post("/v1/spaces/:space_id/members", async (c) => {
    const space_id = c.req.param("space_id");
    const body = await c.req.json();
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const member = await config.inviteMember(space_id, body.email, body.role);
    return c.json(member, 201);
  });

  app.patch("/v1/spaces/:space_id/members/:member_id", async (c) => {
    const space_id = c.req.param("space_id");
    const member_id = c.req.param("member_id");
    const body = await c.req.json();
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const member = await config.updateMemberRole(space_id, member_id, body.role);
    if (!member) return c.json({ code: "not_found", message: "Member not found" }, 404);
    return c.json(member);
  });

  app.delete("/v1/spaces/:space_id/members/:member_id", async (c) => {
    const space_id = c.req.param("space_id");
    const member_id = c.req.param("member_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    await config.removeMember(space_id, member_id);
    return c.json({ ok: true });
  });

  app.get("/v1/spaces/:space_id/grants", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const grants = await config.listGrants(space_id);
    return c.json({ grants });
  });

  app.post("/v1/spaces/:space_id/grants", async (c) => {
    const space_id = c.req.param("space_id");
    const body = await c.req.json();
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const result = await config.mintGrant(space_id, body, provenanceFrom(auth, space_id, c.req.header("Idempotency-Key") ?? undefined));
    return c.json(result.body, 200);
  });

  app.post("/v1/spaces/:space_id/grants/:grant_id/revoke", async (c) => {
    const space_id = c.req.param("space_id");
    const grant_id = c.req.param("grant_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const result = await config.revokeGrant(space_id, grant_id);
    return c.json(result);
  });

  app.post("/v1/spaces/:space_id/grants/:grant_id/rotate", async (c) => {
    const space_id = c.req.param("space_id");
    const grant_id = c.req.param("grant_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const result = await config.rotateGrant(space_id, grant_id, provenanceFrom(auth, space_id));
    if (!result) return c.json({ code: "not_found", message: "Grant not found" }, 404);
    return c.json(result.body, 200);
  });

  app.get("/v1/spaces/:space_id/triggers", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const triggers = await config.listTriggers(space_id);
    return c.json({ triggers });
  });

  app.post("/v1/spaces/:space_id/triggers", async (c) => {
    const space_id = c.req.param("space_id");
    const body = await c.req.json();
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "trigger:register");
    if (scopeCheck) return scopeCheck;

    const trigger = await config.registerTrigger(space_id, normalizeTriggerBody(body));
    return c.json(trigger, 201);
  });

  app.post("/v1/spaces/:space_id/triggers/:trigger_id/disable", async (c) => {
    const space_id = c.req.param("space_id");
    const trigger_id = c.req.param("trigger_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "trigger:register");
    if (scopeCheck) return scopeCheck;

    const result = await config.disableTrigger(space_id, trigger_id);
    return c.json(result);
  });

  app.get("/v1/spaces/:space_id/triggers/deliveries", async (c) => {
    const space_id = c.req.param("space_id");
    const limit = Number(c.req.query("limit") ?? "50");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const deliveries = await config.listTriggerDeliveries(space_id, limit);
    return c.json({ deliveries });
  });

  app.post("/v1/spaces/:space_id/triggers/:trigger_id/replay", async (c) => {
    const space_id = c.req.param("space_id");
    const trigger_id = c.req.param("trigger_id");
    const body = await c.req.json();
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    await config.recordTriggerDelivery(space_id, trigger_id, body.source_event_id, false);
    return c.json({ ok: true });
  });

  app.get("/v1/ops/grants/export", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    if (!hasScope(auth, "space:admin")) {
      return denialResponse(MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE, {
        message: "Hub operator access required",
        hint: { required_scope: "space:admin" },
      });
    }

    const data = await config.exportGrants();
    return c.json(data);
  });

  app.get("/v1/ops/federation/status", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:admin");
    if (scopeCheck) return scopeCheck;

    const status = await ctx.federationPort.status();
    return c.json(status);
  });
}
