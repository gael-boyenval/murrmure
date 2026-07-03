import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import type { Capability } from "@murrmure/contracts";
import { hasCapability, resolveEffectiveCapabilities } from "@murrmure/hub-core";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { TokenContext } from "../../auth.js";

const SCOPE_MESSAGES: Record<string, string> = {
  "space:admin": "Administrator access required for this action",
  "space:read": "Read access to this space is required",
  "space:enter": "You need permission to enter this space",
  "action:invoke": "Action invoke permission required",
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
  return denialResponse(MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE, {
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

export function actorKind(ctx: TokenContext, effective?: Capability[]): "human" | "agent" {
  if (ctx.space_id === "bootstrap") return "human";
  if (ctx.harness_id === "human_only") return "human";
  if (ctx.harness_id) return "agent";
  if (ctx.actor_id.includes("agent")) return "agent";

  const caps = effective ?? resolveEffectiveCapabilities({ scopes: ctx.scopes });
  if (hasCapability(caps, "hub:admin")) return "human";
  if (hasCapability(caps, "gate:resolve") && !hasCapability(caps, "space:write")) return "human";
  if (hasCapability(caps, ["space:write", "action:invoke", "flow:run"])) return "agent";

  return "human";
}

export function requireInstallPolicy(
  ctx: TokenContext,
  space: { install_policy?: string },
  effective?: Capability[],
): Response | null {
  if (space.install_policy === "human_only" && actorKind(ctx, effective) === "agent") {
    return denialResponse(MURRMURE_DENIAL_CODES.INSTALL_POLICY_VIOLATION, {
      message: "Install blocked: space policy is human_only",
      hint: { install_policy: "human_only" },
    });
  }
  return null;
}

export function requireCapability(
  ctx: TokenContext,
  required: Capability | Capability[],
  effective: Capability[],
): Response | null {
  if (hasCapability(effective, required)) return null;
  const cap = Array.isArray(required) ? required[0] : required;
  return denialResponse(MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE, {
    message: `Missing required capability: ${cap}`,
    hint: { required_capability: cap },
  });
}

export function provenanceFrom(ctx: TokenContext, spaceId: string, commandId?: string) {
  return {
    space_id: spaceId,
    actor_id: ctx.actor_id,
    token_id: ctx.token_id,
    command_id: commandId,
  };
}

export async function resolveTokenCapabilities(
  studio: StudioPersistencePort,
  auth: { token_id: string; scopes: string[] },
): Promise<Capability[]> {
  const token = await studio.getToken(auth.token_id.replace(/^tok_/, ""));
  return resolveEffectiveCapabilities({
    scopes: token?.scopes ?? auth.scopes,
    capabilities: token?.capabilities,
  });
}
