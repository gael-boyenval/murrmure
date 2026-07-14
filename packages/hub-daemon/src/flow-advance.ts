import type { Capability } from "@murrmure/contracts";
import { resolveEffectiveCapabilities } from "@murrmure/hub-core";
import type { DaemonContext } from "./context.js";
import {
  maybeAdvanceFlow,
  bootstrapInitialFlowStep,
  type FlowAdvanceDeps,
  type FlowAdvanceAuth,
} from "@murrmure/hub-core";
import { ulid } from "ulid";
import { dispatchFlowSteps } from "./flow-dispatch.js";

async function resolveFlowRunAuth(
  ctx: DaemonContext,
  run: NonNullable<Awaited<ReturnType<typeof ctx.murrmurePersistence.getRun>>>,
): Promise<FlowAdvanceAuth> {
  const actor_id = String(run.exec_context._flow_actor_id ?? "system_flow");
  const token_id = String(run.exec_context._flow_token_id ?? "system");
  const bareToken = token_id.replace(/^tok_/, "");
  const token = bareToken !== "system" ? await ctx.murrmurePersistence.getToken(bareToken) : null;
  const capabilities: Capability[] = token
    ? resolveEffectiveCapabilities({
        scopes: token.scopes,
        capabilities: token.capabilities,
      })
    : ["hub:admin", "flow:run", "action:invoke"];
  return {
    actor_id,
    token_id,
    capabilities,
    flow_acl: token?.flow_acl,
  };
}

function flowAdvanceDeps(ctx: DaemonContext): FlowAdvanceDeps {
  return {
    studio: ctx.murrmurePersistence,
    handler: ctx.handler,
    ids: { ulid: () => ulid() },
    clock: { nowIso: () => new Date().toISOString() },
    cancelTimeoutMs: ctx.config.cancelTimeoutMs,
    executorPollStore: ctx.executorPollStore,
    guard: ctx.spaceRunGuard,
    resolveFlowAuth: (run) => resolveFlowRunAuth(ctx, run),
    dispatchSteps: async (input) => {
      await dispatchFlowSteps(ctx.invokeService, input);
    },
  };
}

export async function advanceFlowAfterStep(
  ctx: DaemonContext,
  input: {
    run_id: string;
    step_id: string;
    actor_id: string;
    token_id: string;
  },
): Promise<void> {
  await maybeAdvanceFlow(flowAdvanceDeps(ctx), input);
}

export async function bootstrapFlowRunSteps(
  ctx: DaemonContext,
  input: {
    run_id: string;
    actor_id: string;
    token_id: string;
  },
): Promise<void> {
  await bootstrapInitialFlowStep(flowAdvanceDeps(ctx), input);
}

export { flowAdvanceDeps };
