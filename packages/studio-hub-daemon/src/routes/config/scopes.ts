import { STUDIO_DENIAL_CODES } from "@murrmure/contracts";
import type { TokenContext } from "../../auth.js";

const SCOPE_MESSAGES: Record<string, string> = {
  "space:admin": "Administrator access required for this action",
  "space:read": "Read access to this space is required",
  "space:enter": "You need permission to enter this space",
  "flow:install": "Flow install permission required",
  "flow:configure": "Flow configure permission required",
  "trigger:register": "Trigger register permission required",
};

export function hasScope(ctx: TokenContext, scope: string): boolean {
  if (ctx.space_id === "bootstrap") return true;
  return ctx.scopes.includes(scope) || ctx.scopes.includes("space:admin");
}

export function requireScope(ctx: TokenContext, scope: string): Response | null {
  if (hasScope(ctx, scope)) return null;
  return denialResponse(STUDIO_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE, {
    message: SCOPE_MESSAGES[scope] ?? `Missing required scope: ${scope}`,
    hint: { required_scope: scope, nearest_space_id: ctx.space_id !== "bootstrap" ? `spc_${ctx.space_id}` : undefined },
  });
}

export function denialResponse(
  code: string,
  body: { message: string; hint?: Record<string, unknown> },
): Response {
  return new Response(JSON.stringify({ code, ...body }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
}

export function actorKind(ctx: TokenContext): "human" | "agent" {
  return ctx.harness_id || ctx.actor_id.includes("agent") ? "agent" : "human";
}

export function provenanceFrom(ctx: TokenContext, spaceId: string, commandId?: string) {
  return {
    space_id: spaceId,
    actor_id: ctx.actor_id,
    token_id: ctx.token_id,
    command_id: commandId,
  };
}
