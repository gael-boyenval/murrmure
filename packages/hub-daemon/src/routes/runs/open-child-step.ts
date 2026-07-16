import type { Hono } from "hono";
import { OpenChildStepBodySchema } from "@murrmure/contracts";
import { openChildStep, type StepOpenJournal } from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireAssignmentScope, requireCapability, resolveTokenCapabilities } from "../config/scopes.js";
import { bareSpaceId, prefixedSpaceId } from "../../space-id.js";
import { flowAdvanceDeps } from "../../flow-advance.js";
import { broadcastSse } from "../../context.js";

export function mountOpenChildStepRoutes(app: Hono, ctx: DaemonContext): void {
  app.post("/v1/runs/:run_id/steps/:parent_step_id{[^/]+}/children/open", async (c) => {
    const run_id = c.req.param("run_id");
    const parent_step_id = c.req.param("parent_step_id");
    const auth = await requireToken(ctx.murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;

    const effective = await resolveTokenCapabilities(ctx.murrmurePersistence, auth);
    const capability = requireCapability(auth, "step:resolve", effective);
    if (capability) return capability;
    const parsed = OpenChildStepBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({
        code: "INVALID_BODY",
        message: "child_step_id and idempotency_key are required; arbitrary input is not accepted",
      }, 400);
    }

    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    const run = await ctx.murrmurePersistence.getRun(bare);
    if (!run) return c.json({ code: "RUN_NOT_FOUND", message: "Run not found" }, 404);
    const assignment = requireAssignmentScope(auth, {
      run_id,
      step_id: parent_step_id,
      space_id: run.space_id,
    });
    if (assignment) return assignment;

    const space_id = run.space_id
      ? prefixedSpaceId(run.space_id)
      : prefixedSpaceId(bareSpaceId(auth.space_id));
    const session_id = `ses_${run.session_id}`;
    const journal: StepOpenJournal = {
      append: async (entry) => {
        await ctx.handler.appendSpaceJournal({
          type: entry.type,
          space_id: entry.space_id,
          session_id: entry.session_id,
          run_id: entry.run_id,
          actor_id: entry.actor_id,
          token_id: entry.token_id,
          data: { ...entry.data, step_id: entry.step_id },
        });
        broadcastSse(ctx, {
          event: "journal.append",
          data: {
            type: entry.type,
            space_id: entry.space_id,
            session_id: entry.session_id,
            run_id: entry.run_id,
            step_id: entry.step_id,
          },
        });
      },
    };

    const result = await openChildStep(flowAdvanceDeps(ctx), {
      run_id,
      parent_step_id,
      body: parsed.data,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      space_id,
      session_id,
      journal,
    });
    if (!result.ok) {
      return c.json({ code: result.code, message: result.message }, result.http);
    }
    return c.json(result, result.deduplicated ? 200 : 201);
  });
}
