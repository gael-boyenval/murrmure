import type { Hono } from "hono";
import { writeStepWorkdirFile } from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { resolveSpaceRoot } from "@murrmure/hub-core";
import { resolveTokenCapabilities, requireCapability } from "../config/scopes.js";

function parseWorkUploadBody(body: unknown): { filename: string; content_base64: string } | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.filename !== "string" || !record.filename.trim()) return null;
  if (typeof record.content_base64 !== "string" || !record.content_base64.trim()) return null;
  return { filename: record.filename, content_base64: record.content_base64 };
}

export function mountStepWorkUploadRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.post("/v1/runs/:run_id/steps/:step_id/work/upload", async (c) => {
    const run_id = c.req.param("run_id");
    const step_id = c.req.param("step_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;

    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const scopeCheck = requireCapability(auth, "step:resolve", effective);
    if (scopeCheck) return scopeCheck;

    const parsed = parseWorkUploadBody(await c.req.json().catch(() => ({})));
    if (!parsed) {
      return c.json({ code: "INVALID_BODY", message: "Work upload body failed validation" }, 400);
    }

    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    const run = await murrmurePersistence.getRun(bare);
    if (!run) {
      return c.json({ code: "RUN_NOT_FOUND", message: "Run not found" }, 404);
    }

    const memo = (await murrmurePersistence.listRunStepMemos(run_id)).find((m) => m.step_id === step_id);
    if (!memo || (memo.status !== "working" && memo.status !== "awaiting_human")) {
      return c.json(
        { code: "STEP_NOT_ACTIVE", message: `Step '${step_id}' is not active for work upload` },
        409,
      );
    }

    if (!run.space_id) {
      return c.json({ code: "SPACE_MISSING", message: "Run has no space_id" }, 422);
    }

    const bindings = await murrmurePersistence.getSpaceBindings(run.space_id);
    const space_root = resolveSpaceRoot(bindings);
    if (!space_root) {
      return c.json({ code: "SPACE_ROOT_MISSING", message: "Space has no linked root path" }, 422);
    }

    let bytes: Buffer;
    try {
      bytes = Buffer.from(parsed.content_base64, "base64");
    } catch {
      return c.json({ code: "INVALID_CONTENT", message: "content_base64 is invalid" }, 400);
    }
    if (bytes.length === 0) {
      return c.json({ code: "INVALID_CONTENT", message: "Upload content is empty" }, 400);
    }

    try {
      const written = await writeStepWorkdirFile({
        space_root,
        run_id,
        step_id,
        filename: parsed.filename,
        bytes,
      });
      return c.json({ ok: true, path: written.path }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Work upload failed";
      return c.json({ code: "WORK_UPLOAD_FAILED", message }, 400);
    }
  });
}
