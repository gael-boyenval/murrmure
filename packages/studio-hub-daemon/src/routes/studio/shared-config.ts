import type { Hono } from "hono";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import {
  readSharedConfig,
  writeCapabilityProjects,
  type CapabilityProject,
} from "../../ops.js";

function normalizeProjects(input: unknown): CapabilityProject[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((p): p is { package_id?: unknown; source?: unknown } => typeof p === "object" && p !== null)
    .map((p) => ({ package_id: String(p.package_id ?? ""), source: String(p.source ?? "") }))
    .filter((p) => p.package_id && p.source);
}

/** BC6b: hub-local capability project registry backed by ~/.studio/hubs/shared.json. */
export function mountStudioRoutes(app: Hono, ctx: DaemonContext): void {
  app.get("/v1/studio/shared-config", async (c) => {
    const auth = await requireToken(ctx.studioPersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const config = readSharedConfig(ctx.config);
    return c.json({ capabilityProjects: config.capabilityProjects ?? [], hubs: config.hubs ?? [] });
  });

  app.put("/v1/studio/shared-config/projects", async (c) => {
    const auth = await requireToken(ctx.studioPersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const body = await c.req.json().catch(() => ({}));
    const projects = normalizeProjects((body as { capabilityProjects?: unknown }).capabilityProjects);
    const next = writeCapabilityProjects(ctx.config, projects);
    return c.json({ capabilityProjects: next.capabilityProjects ?? [] });
  });
}
