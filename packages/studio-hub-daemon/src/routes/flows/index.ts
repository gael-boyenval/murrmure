import type { Hono } from "hono";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireScope } from "../config/scopes.js";
import { executeLiveApply, executeUnmount } from "../../live-apply.js";
import { bareSpaceId } from "../../space-id.js";

export function mountFlowRuntimeRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.get("/v1/spaces/:space_id/flows/live", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    return c.json({ mounts: ctx.mountRegistry.getRoutes(space_id) });
  });

  app.post("/v1/spaces/:space_id/flows/:install_id/apply", async (c) => {
    const space_id = c.req.param("space_id");
    const install_id = c.req.param("install_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;

    const result = await executeLiveApply(app, ctx, space_id, install_id, auth);
    if (!result.ok) {
      return c.json({ code: result.code, message: result.message, hint: result.hint }, result.http_status as 403);
    }
    return c.json({
      evolution_state: result.evolution_state,
      install_id: result.install_id,
      mount_applied: true,
      tools_added: result.tools_added,
      tools_removed: result.tools_removed,
    });
  });

  app.post("/v1/spaces/:space_id/flows/rollback", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "flow:install");
    if (scopeCheck) return scopeCheck;

    const body = await c.req.json();
    const flowId = String(body.flow_id ?? body.package_id ?? "");
    const toVersion = String(body.to_version ?? "");
    const installs = await murrmurePersistence.listFlowInstalls(bareSpaceId(space_id));
    const target = installs.find((i) => i.flow_id === flowId && i.version === toVersion);
    if (!target) {
      return c.json({ code: "not_found", message: "Install version not found" }, 404);
    }

    const result = await executeLiveApply(app, ctx, space_id, target.install_id, auth);
    if (!result.ok) {
      return c.json({ code: result.code, message: result.message, hint: result.hint }, result.http_status as 403);
    }
    return c.json({
      evolution_state: result.evolution_state,
      install_id: result.install_id,
      rolled_back_to: toVersion,
      tools_added: result.tools_added,
      tools_removed: result.tools_removed,
    });
  });

  app.post("/v1/spaces/:space_id/flows/:install_id/unmount", async (c) => {
    const space_id = c.req.param("space_id");
    const install_id = c.req.param("install_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "flow:install");
    if (scopeCheck) return scopeCheck;

    const install = await murrmurePersistence.getFlowInstall(install_id);
    if (!install || bareSpaceId(install.space_id) !== bareSpaceId(space_id)) {
      return c.json({ code: "not_found", message: "Install not found" }, 404);
    }
    await executeUnmount(app, ctx, space_id, install.flow_id);
    await murrmurePersistence.updateFlowInstall(install_id, { evolution_state: "superseded" });
    return c.json({ ok: true, flow_id: install.flow_id });
  });
}

/** @deprecated use mountFlowRuntimeRoutes */
export const mountCapabilityRuntimeRoutes = mountFlowRuntimeRoutes;
