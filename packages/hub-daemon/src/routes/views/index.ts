import { existsSync, readFileSync } from "node:fs";
import { join, normalize, relative, resolve } from "node:path";
import type { Hono } from "hono";
import { isLocalSpaceBinding } from "@murrmure/contracts";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireCapability, resolveTokenCapabilities } from "../config/scopes.js";
import { bareSpaceId } from "../../space-id.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function contentType(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf("."));
  return MIME[ext] ?? "application/octet-stream";
}

export function mountViewAssetRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.get("/v1/spaces/:space_id/views/:view_id/*", async (c) => {
    const space_id = c.req.param("space_id");
    const view_id = c.req.param("view_id");
    const rest = c.req.path.split(`/views/${view_id}/`)[1] ?? "";

    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:read", effective);
    if (capCheck) return capCheck;

    const bare = bareSpaceId(space_id);
    const bindings = await murrmurePersistence.getSpaceBindings(bare);
    const localBindings = bindings.filter(isLocalSpaceBinding);
    const spaceRoot = localBindings.find((b) => b.primary)?.path ?? localBindings[0]?.path;
    if (!spaceRoot) {
      return c.json({ code: "SPACE_ROOT_MISSING", message: "Space has no linked root path" }, 422);
    }

    // Production Views are locally built and scaffolded under `<space>/.mrmr/views`
    // (CLI `space view init` / `view dev` / dev fixture route all use `.mrmr/views`).
    // Serve packaged/shell assets from the same canonical disk location.
    const viewRoot = resolve(join(spaceRoot, ".mrmr", "views", view_id));
    const target = normalize(resolve(viewRoot, rest));
    if (!target.startsWith(viewRoot)) {
      return c.json({ code: "PATH_TRAVERSAL", message: "Invalid view asset path" }, 400);
    }
    if (!existsSync(target)) {
      return c.json({ code: "VIEW_ASSET_NOT_FOUND", message: "View asset not found" }, 404);
    }

    const rel = relative(viewRoot, target);
    if (rel.startsWith("..")) {
      return c.json({ code: "PATH_TRAVERSAL", message: "Invalid view asset path" }, 400);
    }

    const bytes = readFileSync(target);
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": contentType(target),
        "cache-control": "no-store",
      },
    });
  });
}
