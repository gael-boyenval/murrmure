import type { Hono } from "hono";
import {
  catalogEntryForStep,
  flowStepContractCatalog,
  resolveSpaceRoot,
} from "@murrmure/hub-core";
import { validateBranchContract, type ArtifactFileMetadata } from "@murrmure/contracts";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { resolveTokenCapabilities, requireCapability, requireAssignmentScope } from "../config/scopes.js";
import { UploadIntentError, type UploadIntentFile } from "../../upload-intent-service.js";

interface IntentBody {
  branch: string;
  payload: Record<string, unknown>;
  files: UploadIntentFile[];
  idempotency_key: string;
}

const MAX_UPLOAD_INTENT_METADATA_BYTES = 1024 * 1024;

function parseIntentBody(body: unknown): IntentBody | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.branch !== "string" || !record.branch) return null;
  if (typeof record.idempotency_key !== "string" || !record.idempotency_key) return null;
  if (!Array.isArray(record.files)) return null;
  const files: UploadIntentFile[] = [];
  for (const raw of record.files) {
    if (!raw || typeof raw !== "object") return null;
    const file = raw as Record<string, unknown>;
    if (
      typeof file.slot !== "string" ||
      typeof file.name !== "string" ||
      typeof file.media_type !== "string" ||
      typeof file.size_bytes !== "number" ||
      !Number.isSafeInteger(file.size_bytes) ||
      file.size_bytes < 0
    ) return null;
    const basename = file.name.replace(/\\/g, "/").split("/").pop();
    if (
      !basename ||
      basename !== file.name ||
      basename === "." ||
      basename === ".." ||
      file.name.includes("\0")
    ) return null;
    files.push({
      slot: file.slot,
      name: file.name,
      media_type: file.media_type.toLowerCase(),
      size_bytes: file.size_bytes,
    });
  }
  if (
    record.payload !== undefined &&
    (!record.payload || typeof record.payload !== "object" || Array.isArray(record.payload))
  ) return null;
  const payload = (record.payload as Record<string, unknown> | undefined) ?? {};
  return { branch: record.branch, payload, files, idempotency_key: record.idempotency_key };
}

function filesBySlot(files: UploadIntentFile[]): Record<string, ArtifactFileMetadata[]> {
  const result: Record<string, ArtifactFileMetadata[]> = {};
  for (const file of files) {
    (result[file.slot] ??= []).push(file);
  }
  return result;
}

function uploadError(c: { json: (body: object, status: never) => Response }, error: unknown): Response {
  if (error instanceof UploadIntentError) {
    return c.json({ code: error.code, message: error.message }, error.http as never);
  }
  return c.json({ code: "UPLOAD_FAILED", message: error instanceof Error ? error.message : "Upload failed" }, 400 as never);
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > maxBytes) {
    throw new UploadIntentError("UPLOAD_SIZE_MISMATCH", "Received bytes exceed declared size", 413);
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UploadIntentError("UPLOAD_SIZE_MISMATCH", "Received bytes exceed declared size", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function mountStepWorkUploadRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.post("/v1/runs/:run_id/steps/:step_id/upload-intents", async (c) => {
    const run_id = c.req.param("run_id");
    const step_id = c.req.param("step_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;

    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const scopeCheck = requireCapability(auth, "step:resolve", effective);
    if (scopeCheck) return scopeCheck;

    let rawBody: unknown;
    try {
      const bytes = await readBoundedBody(c.req.raw, MAX_UPLOAD_INTENT_METADATA_BYTES);
      rawBody = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      if (error instanceof UploadIntentError) return uploadError(c as never, error);
      return c.json({ code: "INVALID_BODY", message: "Upload intent body is not valid JSON" }, 400);
    }
    const parsed = parseIntentBody(rawBody);
    if (!parsed) {
      return c.json({ code: "INVALID_BODY", message: "Upload intent body failed validation" }, 400);
    }

    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    const run = await murrmurePersistence.getRun(bare);
    if (!run?.flow_id) {
      return c.json({ code: "RUN_NOT_FOUND", message: "Run not found" }, 404);
    }
    if (run.lifecycle !== "working" && run.lifecycle !== "input-required") {
      return c.json({ code: "RUN_TERMINAL", message: `Run is ${run.lifecycle}` }, 409);
    }

    if (!run.space_id) {
      return c.json({ code: "SPACE_MISSING", message: "Run has no space_id" }, 422);
    }

    // An ephemeral assignment token may only create upload intents for its own
    // run/step/space; a grant token may only act within its own space.
    const assignmentScope = requireAssignmentScope(auth, {
      run_id,
      step_id,
      space_id: run.space_id,
    });
    if (assignmentScope) return assignmentScope;

    const memo = (await murrmurePersistence.listRunStepMemos(run_id)).find((m) => m.step_id === step_id);
    if (!memo || memo.status !== "working") {
      return c.json(
        { code: "STEP_NOT_ACTIVE", message: `Step '${step_id}' is not active for work upload` },
        409,
      );
    }

    const flow = await murrmurePersistence.getFlowIndexEntry(run.flow_id, run.space_id);
    const entry = catalogEntryForStep(flowStepContractCatalog(flow), step_id);
    const branch = entry?.branches[parsed.branch];
    if (!branch) {
      return c.json({ code: "BRANCH_NOT_FOUND", message: `Unknown branch '${parsed.branch}'` }, 400);
    }
    const validation = validateBranchContract(branch, {
      payload: parsed.payload,
      files: filesBySlot(parsed.files),
    });
    if (!validation.ok) {
      return c.json(
        {
          code: validation.code,
          message: "Branch resolve contract validation failed",
          errors: validation.errors,
        },
        400,
      );
    }

    const bindings = await murrmurePersistence.getSpaceBindings(run.space_id);
    const space_root = resolveSpaceRoot(bindings);
    if (!space_root) {
      return c.json({ code: "SPACE_ROOT_MISSING", message: "Space has no linked root path" }, 422);
    }

    try {
      const intent = await ctx.uploadIntentService.issue({
        space_root,
        run_id,
        step_id,
        branch: parsed.branch,
        space_id: run.space_id,
        actor_id: auth.actor_id,
        token_id: auth.token_id,
        idempotency_key: parsed.idempotency_key,
        files: parsed.files,
      });
      return c.json({
        ok: true,
        intent_id: intent.intent_id,
        expires_in_ms: 60 * 60 * 1000,
        files: intent.files.map((file, index) => ({ index, size_bytes: file.size_bytes })),
      }, 201);
    } catch (error) {
      return uploadError(c as never, error);
    }
  });

  app.put("/v1/upload-intents/:intent_id/files/:index", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const scopeCheck = requireCapability(auth, "step:resolve", effective);
    if (scopeCheck) return scopeCheck;
    const index = Number(c.req.param("index"));
    if (!Number.isSafeInteger(index) || index < 0) {
      return c.json({ code: "UPLOAD_FILE_NOT_FOUND", message: "Invalid upload file index" }, 404);
    }
    const intentScope = ctx.uploadIntentService.getIntentScope(
      c.req.param("intent_id"),
      auth.actor_id,
      auth.token_id,
    );
    if (!intentScope) {
      return c.json({ code: "UPLOAD_INTENT_NOT_FOUND", message: "Upload intent not found or expired" }, 410);
    }
    const assignmentScope = requireAssignmentScope(auth, intentScope);
    if (assignmentScope) return assignmentScope;
    try {
      const metadata = ctx.uploadIntentService.authorizeFile(
        c.req.param("intent_id"),
        index,
        auth.actor_id,
        auth.token_id,
      );
      let bytes: Uint8Array;
      try {
        bytes = await readBoundedBody(c.req.raw, metadata.size_bytes);
      } catch (error) {
        if (error instanceof UploadIntentError) {
          await ctx.uploadIntentService.recordTransferFailure(
            c.req.param("intent_id"),
            index,
            auth.actor_id,
            auth.token_id,
            error.code,
          );
        }
        throw error;
      }
      const result = await ctx.uploadIntentService.acceptFile({
        intent_id: c.req.param("intent_id"),
        index,
        actor_id: auth.actor_id,
        token_id: auth.token_id,
        bytes,
      });
      return c.json({ ok: true, ...result }, 200);
    } catch (error) {
      return uploadError(c as never, error);
    }
  });

  app.delete("/v1/upload-intents/:intent_id", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const scopeCheck = requireCapability(auth, "step:resolve", effective);
    if (scopeCheck) return scopeCheck;
    const intentScope = ctx.uploadIntentService.getIntentScope(
      c.req.param("intent_id"),
      auth.actor_id,
      auth.token_id,
    );
    if (!intentScope) {
      return c.json({ code: "UPLOAD_INTENT_NOT_FOUND", message: "Upload intent not found or expired" }, 410);
    }
    const assignmentScope = requireAssignmentScope(auth, intentScope);
    if (assignmentScope) return assignmentScope;
    try {
      await ctx.uploadIntentService.abandonAuthorized(
        c.req.param("intent_id"),
        auth.actor_id,
        auth.token_id,
      );
      return c.json({ ok: true }, 200);
    } catch (error) {
      return uploadError(c as never, error);
    }
  });

  app.post("/v1/runs/:run_id/steps/:step_id/work/upload", (c) =>
    c.json(
      {
        code: "DIRECT_WORK_UPLOAD_REMOVED",
        message: "Create an upload intent and transfer raw bytes; base64 work upload was removed",
      },
      410,
    ));
}
