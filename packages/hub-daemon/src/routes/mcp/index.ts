import type { Hono } from "hono";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import type { ControlPrincipal } from "../../control-bus.js";
import { bareSpaceId } from "../../space-id.js";

export function mountMcpRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.get("/v1/mcp/catalog", async (c) => {
    const space_id = c.req.query("space_id") ?? c.req.header("X-Murrmure-Space-Id") ?? "";
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id || undefined);
    if (auth instanceof Response) return auth;

    const tools = await ctx.mcpToolRegistry.listForToken(auth);
    return c.json({ tools });
  });

  app.post("/v1/mcp/session/handshake", async (c) => {
    const body = await c.req.json();
    const space_id = body.space_id ?? c.req.query("space_id") ?? "";
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id || undefined);
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
    ctx.mcpSessionRegistry.connect(principal);

    const serverTools = (await ctx.mcpToolRegistry.listForToken(auth)).map((t) => t.name);

    const ack = ctx.controlBus.publishHandshakeAck(principal, serverTools, []);
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
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id || undefined);
    if (auth instanceof Response) return auth;

    const toolName = String(body.name ?? body.tool ?? "");
    const args = (body.arguments ?? body.args ?? {}) as Record<string, unknown>;

    const authz = await ctx.mcpToolRegistry.authorizeTool(auth, toolName);
    if (!authz.ok) {
      return c.json(
        {
          code: MURRMURE_DENIAL_CODES.TOOL_NOT_AUTHORIZED,
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

    return c.json({ code: "tool_not_found", message: `Unknown tool: ${toolName}` }, 404);
  });
}
