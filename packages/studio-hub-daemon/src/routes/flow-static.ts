import type { Hono } from "hono";
import { existsSync, readFileSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import type { DaemonContext } from "../context.js";
import { blobDir } from "../bundle-store.js";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

export function mountFlowStaticRoutes(app: Hono, ctx: DaemonContext): void {
  app.get("/flows/:flow_id/:version/ui/*", async (c) => {
    const flowId = c.req.param("flow_id");
    const version = c.req.param("version");
    const rest = c.req.path.split(`/flows/${flowId}/${version}/ui/`)[1] ?? "shell.html";

    const install = await ctx.murrmurePersistence.findFlowInstallByPackageVersion(flowId, version);
    if (!install?.bundle_digest) {
      return c.text("UI bundle not found", 404);
    }

    const uiRoot = join(blobDir(ctx.config.dataDir, install.bundle_digest), "ui");
    const filePath = normalize(join(uiRoot, rest));
    if (filePath !== uiRoot && !filePath.startsWith(uiRoot + "/")) {
      return c.text("Not found", 404);
    }
    if (!existsSync(filePath)) {
      return c.text("Not found", 404);
    }

    const ext = extname(filePath);
    const body = readFileSync(filePath);
    return new Response(body, {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "content-security-policy": "default-src 'self'; script-src 'self'; connect-src 'self'",
      },
    });
  });
}

/** @deprecated use mountFlowStaticRoutes */
export const mountCapabilityStaticRoutes = mountFlowStaticRoutes;
