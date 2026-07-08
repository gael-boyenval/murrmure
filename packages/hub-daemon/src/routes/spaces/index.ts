import type { Hono } from "hono";
import {
  SpaceApplyBundleSchema,
  SpaceBindingsSchema,
  RemoteHubSpaceBindingSchema,
  JOURNAL_EVENT_TYPES,
  isLocalSpaceBinding,
} from "@murrmure/contracts";
import {
  applyIndexDiff,
  buildIndexStatus,
  validateApplyBundle,
  parseFlowManifest,
  rejectInlineScriptSteps,
  lintSpaceApplyBundle,
} from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import {
  requireCapability,
  requireInstallPolicy,
  requireScope,
  resolveTokenCapabilities,
} from "../config/scopes.js";
import { bareSpaceId, prefixedSpaceId } from "../../space-id.js";
import { markSpaceLinkForActor } from "@murrmure/hub-core";
import { broadcastSse } from "../../context.js";

export function mountSpaceIndexRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.post("/v1/spaces/:space_id/link", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:write", effective);
    if (capCheck) return capCheck;

    const body = await c.req.json();
    const host = String(body.host ?? "local");
    const path = String(body.path ?? "");
    if (!path) {
      return c.json({ code: "INVALID_BINDING", message: "path is required" }, 400);
    }

    const bare = bareSpaceId(space_id);
    const space = await murrmurePersistence.getSpace(bare);
    if (!space) return c.json({ code: "space_not_found", message: "Space not found" }, 404);

    const existing = await murrmurePersistence.getSpaceBindings(bare);
    const bindings = SpaceBindingsSchema.parse([
      ...existing.filter((b) => !(isLocalSpaceBinding(b) && b.host === host && b.path === path)),
      { host, path, primary: body.primary !== false },
    ].map((b, i, arr) => ({ ...b, primary: i === arr.length - 1 ? Boolean(b.primary) : false })));

    await murrmurePersistence.setSpaceBindings(bare, bindings);
    const landing = await markSpaceLinkForActor(murrmurePersistence, auth.actor_id);

    const originSpaceId = prefixedSpaceId(bare);
    broadcastSse(ctx, {
      event: JOURNAL_EVENT_TYPES.SPACE_INDEX_UPDATED,
      data: { space_id: originSpaceId, changed: 0 },
    });
    broadcastSse(ctx, {
      event: "journal.append",
      data: {
        type: JOURNAL_EVENT_TYPES.SPACE_INDEX_UPDATED,
        space_id: originSpaceId,
        changed: 0,
      },
    });

    return c.json({
      space_id: prefixedSpaceId(bare),
      bindings,
      suggest_landing: landing.suggest_landing,
    });
  });

  app.post("/v1/spaces/:space_id/link/remote", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:write", effective);
    if (capCheck) return capCheck;

    const body = await c.req.json();
    const peer_hub_id = String(body.peer_hub_id ?? body.peer ?? "");
    const remote_space_id = String(body.remote_space_id ?? body.space ?? "");
    if (!peer_hub_id || !remote_space_id) {
      return c.json(
        { code: "INVALID_BINDING", message: "peer_hub_id and remote_space_id are required" },
        400,
      );
    }

    const bare = bareSpaceId(space_id);
    const space = await murrmurePersistence.getSpace(bare);
    if (!space) return c.json({ code: "space_not_found", message: "Space not found" }, 404);

    const binding = RemoteHubSpaceBindingSchema.parse({
      type: "remote_hub",
      peer_hub_id,
      remote_space_id: remote_space_id.startsWith("spc_")
        ? remote_space_id
        : prefixedSpaceId(remote_space_id),
      primary: true,
    });

    await murrmurePersistence.setSpaceBindings(bare, [binding]);
    return c.json({ space_id: prefixedSpaceId(bare), bindings: [binding] });
  });

  app.post("/v1/spaces/:space_id/apply", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:write", effective);
    if (capCheck) return capCheck;

    const body = await c.req.json();
    const rawBundle = (body.bundle ?? body) as { flows?: Array<{ manifest?: unknown }> };
    for (const flow of rawBundle.flows ?? []) {
      const guard = rejectInlineScriptSteps(flow.manifest);
      if (!guard.ok) {
        return c.json({ code: guard.code, message: guard.message }, 400);
      }
    }

    const parsed = SpaceApplyBundleSchema.safeParse(body.bundle ?? body);
    if (!parsed.success) {
      return c.json(
        { code: "INVALID_APPLY_BUNDLE", message: "Apply bundle failed validation", issues: parsed.error.issues },
        400,
      );
    }

    const validation = validateApplyBundle(parsed.data);
    if (!validation.ok) {
      return c.json({ code: validation.code, message: validation.message }, 400);
    }

    for (const flow of parsed.data.flows ?? []) {
      const raw = flow.raw ?? flow.manifest;
      const check = parseFlowManifest(raw);
      if (!check.ok) {
        return c.json({ code: check.code, message: check.message }, 400);
      }
    }

    const bare = bareSpaceId(space_id);
    const space = await murrmurePersistence.getSpace(bare);
    if (!space) return c.json({ code: "space_not_found", message: "Space not found" }, 404);

    const policyCheck = requireInstallPolicy(auth, space, effective);
    if (policyCheck) return policyCheck;

    const originSpaceId = prefixedSpaceId(bare);
    const current = await murrmurePersistence.getSpaceIndexSnapshot(bare);
    const result = applyIndexDiff(current, parsed.data, originSpaceId);
    const warnings = lintSpaceApplyBundle(parsed.data);

    await murrmurePersistence.replaceSpaceIndex(bare, result.next);

    broadcastSse(ctx, {
      event: JOURNAL_EVENT_TYPES.SPACE_INDEX_UPDATED,
      data: {
        space_id: originSpaceId,
        summary: result.summary,
        changed: result.summary.changed,
      },
    });
    broadcastSse(ctx, {
      event: "journal.append",
      data: {
        type: JOURNAL_EVENT_TYPES.SPACE_INDEX_UPDATED,
        space_id: originSpaceId,
        summary: result.summary,
        changed: result.summary.changed,
      },
    });

    return c.json({
      space_id: originSpaceId,
      summary: result.summary,
      changes: result.changes.filter((change) => change.change !== "unchanged"),
      status: buildIndexStatus(result.next),
      warnings,
    });
  });

  app.get("/v1/spaces/:space_id/index/status", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const bare = bareSpaceId(space_id);
    const snapshot = await murrmurePersistence.getSpaceIndexSnapshot(bare);
    const bindings = await murrmurePersistence.getSpaceBindings(bare);
    return c.json({
      space_id: prefixedSpaceId(bare),
      bindings,
      ...buildIndexStatus(snapshot),
    });
  });

  app.get("/v1/spaces/:space_id/actions", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const actions = await murrmurePersistence.listIndexedActions(bareSpaceId(space_id));
    return c.json({ actions });
  });

  app.get("/v1/spaces/:space_id/executors", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const executors = await murrmurePersistence.listIndexedExecutors(bareSpaceId(space_id));
    return c.json({ executors });
  });

  app.get("/v1/spaces/:space_id/hooks", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const hooks = await murrmurePersistence.listIndexedHooks(bareSpaceId(space_id));
    return c.json({ hooks });
  });

  app.post("/v1/spaces/:space_id/actions/:action_name/invoke", async (c) => {
    const space_id = c.req.param("space_id");
    const action_name = c.req.param("action_name");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "action:invoke", effective);
    if (capCheck) return capCheck;

    const body = await c.req.json().catch(() => ({}));
    const result = await ctx.invokeService.invokeAction({
      space_id,
      action_name,
      body,
      idempotency_header: c.req.header("Idempotency-Key") ?? undefined,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
    });
    return c.json(result.body, result.http);
  });

  app.get("/v1/spaces/:space_id/index/flows", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const flows = await murrmurePersistence.listFlowIndex(bareSpaceId(space_id));
    return c.json({ flows });
  });

  app.get("/v1/flows/:flow_id", async (c) => {
    const flow_id = c.req.param("flow_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const scopedSpaceId = auth.space_id !== "bootstrap" ? bareSpaceId(auth.space_id) : undefined;
    const flow = await murrmurePersistence.getFlowIndexEntry(flow_id, scopedSpaceId);
    if (!flow) return c.json({ code: "flow_not_found", message: "Flow not indexed" }, 404);

    if (auth.space_id !== "bootstrap") {
      const authSpaceId = prefixedSpaceId(bareSpaceId(auth.space_id));
      if (flow.origin_space_id !== authSpaceId) {
        return c.json(
          { code: "SCOPE_ENFORCEMENT_FAILURE", message: "Token not valid for this space or action" },
          403,
        );
      }
    }

    return c.json(flow);
  });
}
