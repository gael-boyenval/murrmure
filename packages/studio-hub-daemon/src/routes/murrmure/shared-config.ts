import type { Hono } from "hono";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import {
  readSharedConfig,
  writeFlowProjects,
  type FlowProject,
} from "../../ops.js";

function normalizeProjects(input: unknown): FlowProject[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .map((p) => ({
      flow_id: String(p.flow_id ?? p.package_id ?? ""),
      source: String(p.source ?? ""),
    }))
    .filter((p) => p.flow_id && p.source);
}

/** BC6b: hub-local flow project registry backed by ~/.murrmure/hubs/shared.json. */
export function mountMurrmureRoutes(app: Hono, ctx: DaemonContext): void {
  app.get("/v1/murrmure/shared-config", async (c) => {
    const auth = await requireToken(ctx.murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const config = readSharedConfig(ctx.config);
    return c.json({ flowProjects: config.flowProjects ?? [], hubs: config.hubs ?? [] });
  });

  app.put("/v1/murrmure/shared-config/projects", async (c) => {
    const auth = await requireToken(ctx.murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const body = await c.req.json().catch(() => ({}));
    const raw = body as { flowProjects?: unknown; capabilityProjects?: unknown };
    const projects = normalizeProjects(raw.flowProjects ?? raw.capabilityProjects);
    const next = writeFlowProjects(ctx.config, projects);
    return c.json({ flowProjects: next.flowProjects ?? [] });
  });
}
