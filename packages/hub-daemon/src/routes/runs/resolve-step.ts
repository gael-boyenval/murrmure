import type { Hono } from "hono";
import { ResolveStepBodySchema } from "@murrmure/contracts";
import {
  resolveFlowStep,
  resolveSpaceRoot,
  resolveWorkdirRelativePath,
  stepWorkdirPath,
  type StepResolveJournal,
} from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { bareSpaceId, prefixedSpaceId } from "../../space-id.js";
import { requireCapability, resolveTokenCapabilities } from "../config/scopes.js";
import { flowAdvanceDeps } from "../../flow-advance.js";
import { broadcastSse } from "../../context.js";
import { UploadIntentError } from "../../upload-intent-service.js";
import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";

function inferredMediaType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".md":
    case ".markdown":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

export function mountResolveStepRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence, handler } = ctx;

  app.post("/v1/runs/:run_id/steps/:step_id{[^/]+}/resolve", async (c) => {
    const run_id = c.req.param("run_id");
    const step_id = c.req.param("step_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;

    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const scopeCheck = requireCapability(auth, "step:resolve", effective);
    if (scopeCheck) return scopeCheck;

    const body = ResolveStepBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return c.json({ code: "INVALID_BODY", message: "Resolve body failed validation" }, 400);
    }

    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    const run = await murrmurePersistence.getRun(bare);
    if (!run) {
      return c.json({ code: "RUN_NOT_FOUND", message: "Run not found" }, 404);
    }

    const token = await murrmurePersistence.getToken(auth.token_id.replace(/^tok_/, ""));
    const tokenRunScope = token?.harness_id?.startsWith("run:")
      ? token.harness_id.slice("run:".length)
      : undefined;
    if (tokenRunScope && tokenRunScope !== run_id && tokenRunScope !== bare) {
      return c.json(
        { code: "TOKEN_RUN_SCOPE_MISMATCH", message: "Token is not scoped to this run" },
        403,
      );
    }
    // Ephemeral resolve tokens are scoped to the exact assignment (run:step);
    // a token minted for another step may not resolve this one.
    if (token?.scope_ref) {
      const expected = `${run_id}:${step_id}`;
      const expectedBare = `${bare}:${step_id}`;
      if (token.scope_ref !== expected && token.scope_ref !== expectedBare) {
        return c.json(
          { code: "TOKEN_STEP_SCOPE_MISMATCH", message: "Token is not scoped to this step" },
          403,
        );
      }
    }

    const space_id = run.space_id
      ? prefixedSpaceId(run.space_id)
      : prefixedSpaceId(bareSpaceId(auth.space_id));
    const session_id = run.session_id ? `ses_${run.session_id}` : undefined;

    const journal: StepResolveJournal = {
      append: async (input) => {
        await handler.appendSpaceJournal({
          type: input.type,
          space_id: input.space_id,
          session_id: input.session_id,
          run_id: input.run_id,
          actor_id: input.actor_id,
          token_id: input.token_id,
          data: {
            ...input.data,
            step_id: input.step_id,
          },
        });

        broadcastSse(ctx, {
          event: "journal.append",
          data: {
            type: input.type,
            space_id: input.space_id,
            session_id: input.session_id,
            run_id: input.run_id,
            step_id: input.step_id,
          },
        });
      },
    };

    let resolveBody = body.data;
    if (!body.data.upload_intent_id && body.data.artifacts_out?.length && run.space_id) {
      const bindings = await murrmurePersistence.getSpaceBindings(run.space_id);
      const spaceRoot = resolveSpaceRoot(bindings);
      if (!spaceRoot) {
        return c.json({ code: "SPACE_ROOT_MISSING", message: "artifacts_out requires a linked space root path" }, 422);
      }
      const workdir = stepWorkdirPath(spaceRoot, run_id, step_id);
      try {
        resolveBody = {
          ...body.data,
          artifacts_out: await Promise.all(body.data.artifacts_out.map(async (artifact) => {
            const localPath = resolveWorkdirRelativePath(workdir, artifact.path);
            if (!localPath) throw new Error("Artifact path escapes the step workdir");
            const details = await stat(localPath);
            if (!details.isFile()) throw new Error("Artifact path is not a file");
            return {
              ...artifact,
              name: artifact.name ?? basename(artifact.path),
              media_type: artifact.media_type ?? inferredMediaType(artifact.path),
              size_bytes: details.size,
            };
          })),
        };
      } catch {
        return c.json({
          code: "CONTRACT_VALIDATION_FAILED",
          message: "Branch resolve contract validation failed",
          errors: [{
            source: "artifact",
            path: "/files",
            rule: "path",
            message: "Artifact must be a readable file in the active step workdir",
          }],
        }, 400);
      }
    }
    let preparedIntentId: string | undefined;
    let prepareError: UploadIntentError | undefined;
    if (body.data.upload_intent_id) {
      try {
        const prepared = await ctx.uploadIntentService.prepareResolve({
          intent_id: body.data.upload_intent_id,
          run_id,
          step_id,
          branch: body.data.branch,
          actor_id: auth.actor_id,
          token_id: auth.token_id,
          idempotency_key: body.data.idempotency_key,
        });
        preparedIntentId = body.data.upload_intent_id;
        resolveBody = { ...body.data, artifacts_out: prepared.artifacts_out };
      } catch (error) {
        if (
          error instanceof UploadIntentError &&
          (error.code === "UPLOAD_INTENT_NOT_FOUND" || error.code === "UPLOAD_INTENT_CONSUMED")
        ) {
          if (error.code === "UPLOAD_INTENT_CONSUMED") {
            preparedIntentId = body.data.upload_intent_id;
          }
          prepareError = error;
        } else if (error instanceof UploadIntentError) {
          return c.json({ code: error.code, message: error.message }, error.http);
        } else {
          return c.json({ code: "UPLOAD_PREPARE_FAILED", message: "Could not prepare upload intent" }, 400);
        }
      }
    }

    const deps = flowAdvanceDeps(ctx);
    const result = await resolveFlowStep(
      {
        studio: murrmurePersistence,
        handler,
        ids: deps.ids,
        clock: deps.clock,
        cancelTimeoutMs: deps.cancelTimeoutMs,
        executorPollStore: deps.executorPollStore,
        dispatchSteps: deps.dispatchSteps,
        registerArtifact: async ({ name, bytes }) => {
          const put = await ctx.artifactService.putArtifact({
            body: {
              space_id,
              name,
              content_base64: bytes.toString("base64"),
              authorized_readers: [space_id, `actor:${auth.actor_id}`],
            },
            actor_id: auth.actor_id,
            token_id: auth.token_id,
          });
          if (put.http >= 400 || !("artifact" in put.body)) {
            throw new Error("Artifact registration failed");
          }
          const artifact = put.body.artifact as { transfer_id: string; digest: string };
          return { transfer_id: artifact.transfer_id, digest: artifact.digest };
        },
      },
      {
        run_id,
        step_id,
        body: resolveBody,
        actor_id: auth.actor_id,
        token_id: auth.token_id,
        space_id,
        session_id,
        journal,
        advance: deps,
      },
    );

    if (!result.ok) {
      if (preparedIntentId) {
        await ctx.uploadIntentService.abandon(preparedIntentId, result.code, "resolve");
      }
      if (prepareError) {
        return c.json({ code: prepareError.code, message: prepareError.message }, prepareError.http);
      }
      return c.json(
        {
          code: result.code,
          message: result.message,
          ...(result.errors ? { errors: result.errors } : {}),
        },
        result.http as 400 | 404 | 409 | 422,
      );
    }

    if (preparedIntentId) {
      await ctx.uploadIntentService.consume(preparedIntentId);
    }

    return c.json(
      {
        ok: true,
        run_id: result.run_id,
        step_id: result.step_id,
        branch: result.branch,
        status: result.status,
      },
      200,
    );
  });
}
