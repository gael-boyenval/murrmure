import type { Hono } from "hono";
import { ResolveStepBodySchema } from "@murrmure/contracts";
import { resolveFlowStep, type StepResolveJournal } from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { bareSpaceId, prefixedSpaceId } from "../../space-id.js";
import { requireCapability, resolveTokenCapabilities } from "../config/scopes.js";
import { flowAdvanceDeps } from "../../flow-advance.js";
import { broadcastSse } from "../../context.js";

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
        body: body.data,
        actor_id: auth.actor_id,
        token_id: auth.token_id,
        space_id,
        session_id,
        journal,
        advance: deps,
      },
    );

    if (!result.ok) {
      return c.json(
        { code: result.code, message: result.message },
        result.http as 400 | 404 | 409 | 422,
      );
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
