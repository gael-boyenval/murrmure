import type { Hono } from "hono";
import { stripTokenId } from "@studio/hub-core";
import { STUDIO_DENIAL_CODES } from "@studio/contracts";
import type { DaemonContext } from "./context.js";
import type { WorkerAuth } from "./capability-worker-pool.js";
import { prefixedSpaceId } from "./space-id.js";

interface BridgeInvokeBody {
  op: "execute" | "query" | "principal";
  cmd?: Record<string, unknown>;
  kind?: string;
  args?: Record<string, unknown>;
}

function parseWorkerToken(req: Request): string | undefined {
  return req.headers.get("X-Studio-Worker-Token") ?? undefined;
}

async function resolveBridgePrincipal(
  ctx: DaemonContext,
  req: Request,
  workerAuth: WorkerAuth,
): Promise<{ spaceId: string; actorId: string; tokenId: string }> {
  const internalSpace = req.headers.get("X-Studio-Internal-Space");
  if (internalSpace) {
    return {
      spaceId: internalSpace.startsWith("spc_") ? internalSpace : prefixedSpaceId(internalSpace),
      actorId: "system_query",
      tokenId: "system",
    };
  }

  const workerSpaceId = workerAuth.spaceId.startsWith("spc_")
    ? workerAuth.spaceId
    : prefixedSpaceId(workerAuth.spaceId);

  const caller = req.headers.get("X-Studio-Caller-Token") ?? req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (caller) {
    const row = await ctx.studioPersistence.getToken(stripTokenId(caller));
    if (row && row.status === "active") {
      const spaceId = row.space_id === "bootstrap" ? workerSpaceId : prefixedSpaceId(row.space_id);
      return {
        spaceId,
        actorId: row.actor_id,
        tokenId: caller.startsWith("tok_") ? caller : `tok_${caller}`,
      };
    }
  }

  return {
    spaceId: workerSpaceId,
    actorId: "system",
    tokenId: "system",
  };
}

export function mountHostBridgeRoutes(app: Hono, ctx: DaemonContext): void {
  app.post("/internal/worker-bridge/invoke", async (c) => {
    const token = parseWorkerToken(c.req.raw);
    if (!token) {
      return c.json({ code: STUDIO_DENIAL_CODES.TOKEN_DENIED, message: "Missing worker token" }, 403);
    }

    const workerAuth = ctx.workerPool.validateToken(token);
    if (!workerAuth) {
      return c.json({ code: "WORKER_TOKEN_DENIED", message: "Invalid worker token" }, 403);
    }

    const principal = await resolveBridgePrincipal(ctx, c.req.raw, workerAuth);
    const body = (await c.req.json()) as BridgeInvokeBody;

    if (body.op === "principal") {
      return c.json({
        actorId: principal.actorId,
        spaceId: principal.spaceId,
        tokenId: principal.tokenId,
      });
    }

    if (body.op === "execute" && body.cmd) {
      const cmd = { ...body.cmd };
      const provenance = { ...(cmd.provenance as Record<string, unknown> | undefined) };
      provenance.space_id = principal.spaceId;
      provenance.actor_id = principal.actorId;
      provenance.token_id = principal.tokenId;
      cmd.provenance = provenance;

      const result = await ctx.handler.execute(cmd as never);
      return c.json(result);
    }

    if (body.op === "query" && body.kind) {
      const args = { ...(body.args ?? {}), space_id: principal.spaceId };
      const data = await ctx.handler.query(body.kind, args);
      return c.json({ data });
    }

    return c.json({ code: "INVALID_OP", message: "Unknown bridge operation" }, 400);
  });
}
