import type { Hono } from "hono";
import { STUDIO_DENIAL_CODES } from "@murrmure/contracts";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import type { ControlPrincipal } from "../../control-bus.js";
import { bareSpaceId, prefixedSpaceId } from "../../space-id.js";
import { findMountForTool, invokeWorkerTool } from "../../worker-tool-dispatch.js";
import { enrichInstanceToolResult } from "../../canvas-links.js";

export function mountMcpRoutes(app: Hono, ctx: DaemonContext): void {
  const { studioPersistence } = ctx;

  app.get("/v1/mcp/catalog", async (c) => {
    const space_id = c.req.query("space_id") ?? c.req.header("X-Studio-Space-Id") ?? "";
    const auth = await requireToken(studioPersistence, c.req.raw, space_id || undefined);
    if (auth instanceof Response) return auth;

    const tools = await ctx.mcpToolRegistry.listForToken(auth);
    return c.json({ tools });
  });

  app.post("/v1/mcp/session/handshake", async (c) => {
    const body = await c.req.json();
    const space_id = body.space_id ?? c.req.query("space_id") ?? "";
    const auth = await requireToken(studioPersistence, c.req.raw, space_id || undefined);
    if (auth instanceof Response) return auth;

    const client_id = String(body.client_id ?? "default-client");
    const last_ack_seq = Number(body.last_ack_seq ?? 0);
    const bareSpace = bareSpaceId(auth.space_id === "bootstrap" ? space_id : auth.space_id);

    const principal: ControlPrincipal = {
      space_id: bareSpace,
      token_id: auth.token_id,
      client_id,
    };

    ctx.controlBus.registerPrincipal(principal);
    ctx.mcpWakeDispatcher.connect(principal);

    const serverTools = (await ctx.mcpToolRegistry.listForToken(auth)).map((t) => t.name);
    const mounts = ctx.mountRegistry.getRoutes(prefixedSpaceId(bareSpace));
    const serverContractVersions = mounts.map((m) => {
      const live = ctx.mountRegistry.getMount(prefixedSpaceId(bareSpace), m.package_id);
      return {
        package_id: m.package_id,
        version: m.semver,
        contract_ref_id: live?.contract_ref_id ?? "",
      };
    });

    const ack = ctx.controlBus.publishHandshakeAck(principal, serverTools, serverContractVersions);
    const drained = ctx.controlBus.drain(principal, last_ack_seq);

    return c.json({
      handshake_ack_seq: ack.params.seq,
      messages: drained,
      server_tools: serverTools,
    });
  });

  app.post("/v1/mcp/tools/call", async (c) => {
    const body = await c.req.json();
    const space_id = body.space_id ?? c.req.query("space_id") ?? "";
    const auth = await requireToken(studioPersistence, c.req.raw, space_id || undefined);
    if (auth instanceof Response) return auth;

    const toolName = String(body.name ?? body.tool ?? "");
    const args = (body.arguments ?? body.args ?? {}) as Record<string, unknown>;

    const authz = await ctx.mcpToolRegistry.authorizeTool(auth, toolName);
    if (!authz.ok) {
      return c.json(
        {
          code: STUDIO_DENIAL_CODES.TOOL_NOT_AUTHORIZED,
          message: `Tool not authorized: ${toolName}`,
          hint: authz.hint,
        },
        403,
      );
    }

    const platformHandler = ctx.mcpToolRegistry.getHandler(toolName);
    if (platformHandler) {
      try {
        const result = await platformHandler(args, auth);
        return c.json({ result });
      } catch (e) {
        return c.json(
          { code: "tool_invoke_failed", message: e instanceof Error ? e.message : "Invoke failed" },
          500,
        );
      }
    }

    const resolvedSpace = auth.space_id === "bootstrap" ? space_id : auth.space_id;
    const workerMount = findMountForTool(ctx, resolvedSpace, toolName);
    if (!workerMount) {
      return c.json({ code: "tool_not_found", message: `Unknown tool: ${toolName}` }, 404);
    }

    try {
      const result = await invokeWorkerTool(ctx, workerMount.mount, workerMount.http, args, auth);
      const enriched = await enrichInstanceToolResult(
        ctx,
        auth.space_id === "bootstrap" ? space_id : auth.space_id,
        result,
      );
      return c.json({ result: enriched });
    } catch (e) {
      return c.json(
        { code: "tool_invoke_failed", message: e instanceof Error ? e.message : "Invoke failed" },
        500,
      );
    }
  });

  app.post("/v1/mcp/wake", async (c) => {
    const body = await c.req.json();
    const auth = await requireToken(studioPersistence, c.req.raw, body.target_space_id);
    if (auth instanceof Response) return auth;

    await ctx.mcpWakeDispatcher.wake({
      target_space_id: body.target_space_id,
      wake_label: body.wake_label,
      payload: body.payload,
      session_hint: "wake",
    });
    return c.json({ ok: true });
  });
}
