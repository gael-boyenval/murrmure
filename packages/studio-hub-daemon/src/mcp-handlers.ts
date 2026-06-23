import type { HubHandler } from "@murrmure/hub-core";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";
import type { McpToolRegistry } from "./mcp-tool-registry.js";
import type { DaemonConfig } from "./context.js";
import type { TokenContext } from "./auth.js";

export function registerPlatformMcpHandlers(
  registry: McpToolRegistry,
  handler: HubHandler,
  config: DaemonConfig,
): void {
  const hubUrl = () => `http://127.0.0.1:${config.port}`;

  registry.registerHandler("get_space_state", async (args, ctx) => {
    const spaceId = resolveSpaceId(ctx, config);
    const instance_id = String(args.instance_id ?? "");
    const inst = await handler.query("instance.get", { space_id: spaceId, instance_id });
    const gates = await handler.query("gate.list", { space_id: spaceId, instance_id });
    return { instance: inst, gates };
  });

  registry.registerHandler("transition", async (args, ctx) => {
    const spaceId = resolveSpaceId(ctx, config);
    const result = await handler.execute({
      kind: "state.transition",
      provenance: {
        space_id: spaceId,
        instance_id: String(args.instance_id ?? ""),
        actor_id: String(args.actor_id ?? ctx.actor_id),
        token_id: ctx.token_id,
      },
      event: String(args.event ?? ""),
      expected_revision: Number(args.expected_revision ?? 0),
    } as never);
    return result.body;
  });

  registry.registerHandler("emit_event", async (args, ctx) => {
    const spaceId = resolveSpaceId(ctx, config);
    const result = await handler.execute({
      kind: "event.append",
      provenance: {
        space_id: spaceId,
        instance_id: String(args.instance_id ?? ""),
        actor_id: ctx.actor_id,
        token_id: ctx.token_id,
      },
      event_type: String(args.event_type ?? ""),
      payload: (args.payload as Record<string, unknown>) ?? {},
    } as never);
    return result.body;
  });

  registry.registerHandler("contract_versions", async (_args, ctx) => {
    const spaceId = resolveSpaceId(ctx, config);
    const space = await handler.query("space.get", { space_id: spaceId });
    return {
      contracts: [
        { id: "linear-demo", version: "1.0.0", ref: "cref_linear_demo" },
        { id: "review-loop", version: "2.0.0", ref: "cref_review_loop" },
        { id: "feature-spec", version: "1.1.0", ref: "cref_feature_spec" },
      ],
      space,
    };
  });

  registry.registerHandler("wait_for_state", async (args, ctx) => {
    const spaceId = resolveSpaceId(ctx, config);
    const reg = await handler.execute({
      kind: "wait.register",
      provenance: {
        space_id: spaceId,
        instance_id: String(args.instance_id ?? ""),
        actor_id: ctx.actor_id,
        token_id: ctx.token_id,
      },
      condition: (args.condition as Record<string, unknown>) ?? {},
      delivery_mode: "in_process",
    } as never);
    return reg.body;
  });

  registry.registerHandler("query_ask", async (args, ctx) => {
    const sourceSpaceId = resolveSpaceId(ctx, config);
    const res = await fetch(`${hubUrl()}/v1/spaces/${sourceSpaceId}/queries/ask`, {
      method: "POST",
      headers: mcpHeaders(ctx),
      body: JSON.stringify({
        target_space_id: args.target_space_id,
        query_type: args.query_type,
        params: args.params ?? {},
        timeout_ms: args.timeout_ms,
      }),
    });
    return res.json();
  });
}

function resolveSpaceId(ctx: TokenContext, config: DaemonConfig): string {
  if (ctx.space_id !== "bootstrap") return prefixedSpaceId(bareSpaceId(ctx.space_id));
  const env = config.defaultSpaceId || process.env.MURRMURE_SPACE_ID || "";
  return env.startsWith("spc_") ? env : prefixedSpaceId(env);
}

function mcpHeaders(ctx: TokenContext): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ctx.token_id}`,
  };
}
