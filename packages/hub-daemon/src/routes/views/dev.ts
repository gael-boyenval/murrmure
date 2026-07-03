import { existsSync, readFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import type { Hono } from "hono";
import { isLocalSpaceBinding, type SpaceBinding } from "@murrmure/contracts";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireCapability, resolveTokenCapabilities } from "../config/scopes.js";
import { bareSpaceId } from "../../space-id.js";

function resolveSpaceRoot(bindings: SpaceBinding[]): string | undefined {
  const localBindings = bindings.filter(isLocalSpaceBinding);
  return localBindings.find((b) => b.primary)?.path ?? localBindings[0]?.path;
}

async function readSpaceRoot(ctx: DaemonContext, space_id: string): Promise<string | Response> {
  const bare = bareSpaceId(space_id);
  const bindings = await ctx.murrmurePersistence.getSpaceBindings(bare);
  const spaceRoot = resolveSpaceRoot(bindings);
  if (!spaceRoot) {
    return new Response(
      JSON.stringify({ code: "SPACE_ROOT_MISSING", message: "Space has no linked root path" }),
      { status: 422, headers: { "content-type": "application/json" } },
    );
  }
  return spaceRoot;
}

export function mountViewDevRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.get("/v1/spaces/:space_id/dev/view-session", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:read", effective);
    if (capCheck) return capCheck;

    const spaceRoot = await readSpaceRoot(ctx, space_id);
    if (spaceRoot instanceof Response) return spaceRoot;

    const sessionPath = join(spaceRoot, ".murrmure", "view-dev.json");
    if (!existsSync(sessionPath)) {
      return c.json({ code: "VIEW_DEV_SESSION_MISSING", message: "No active view dev session" }, 404);
    }

    try {
      const session = JSON.parse(readFileSync(sessionPath, "utf-8")) as Record<string, unknown>;
      return c.json({ session });
    } catch {
      return c.json({ code: "VIEW_DEV_SESSION_INVALID", message: "Invalid view-dev.json" }, 500);
    }
  });

  app.get("/v1/spaces/:space_id/dev/view-fixtures/:view_id/:fixture_name", async (c) => {
    const space_id = c.req.param("space_id");
    const view_id = c.req.param("view_id");
    const fixture_name = c.req.param("fixture_name");

    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:read", effective);
    if (capCheck) return capCheck;

    const spaceRoot = await readSpaceRoot(ctx, space_id);
    if (spaceRoot instanceof Response) return spaceRoot;

    const fixturesDir = resolve(join(spaceRoot, "murrmure", "views", view_id, "dev", "fixtures"));
    const target = normalize(resolve(fixturesDir, `${fixture_name}.json`));
    if (!target.startsWith(fixturesDir)) {
      return c.json({ code: "PATH_TRAVERSAL", message: "Invalid fixture path" }, 400);
    }
    if (!existsSync(target)) {
      return c.json({ code: "VIEW_FIXTURE_NOT_FOUND", message: "Fixture not found" }, 404);
    }

    try {
      const context = JSON.parse(readFileSync(target, "utf-8")) as Record<string, unknown>;
      return c.json({ context });
    } catch {
      return c.json({ code: "VIEW_FIXTURE_INVALID", message: "Invalid fixture JSON" }, 500);
    }
  });
}
