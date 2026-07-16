import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import type { Capability } from "@murrmure/contracts";
import { hasCapability, resolveEffectiveCapabilities } from "@murrmure/hub-core";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
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

/** True when the token holds any of the given scopes (or `space:admin`). */
export function hasAnyScope(ctx: TokenContext, scopes: string[]): boolean {
  if (ctx.space_id === "bootstrap") return true;
  if (ctx.scopes.includes("space:admin")) return true;
  return scopes.some((scope) => ctx.scopes.includes(scope));
}

export function requireScope(ctx: TokenContext, scope: string): Response | null {
  if (hasScope(ctx, scope)) return null;
  return denialResponse(MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE, {
    message: SCOPE_MESSAGES[scope] ?? `Missing required scope: ${scope}`,
    hint: { required_scope: scope, nearest_space_id: ctx.space_id !== "bootstrap" ? `spc_${ctx.space_id}` : undefined },
  });
}

/** Require any one of the given scopes; used by endpoints reachable through
 *  more than one capability (e.g. artifact bytes via `blob:read` or a federated
 *  `step:resolve` credential). */
export function requireAnyScope(ctx: TokenContext, scopes: string[]): Response | null {
  if (hasAnyScope(ctx, scopes)) return null;
  return denialResponse(MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE, {
    message: `Missing required scope: ${scopes.join(" or ")}`,
    hint: { required_scopes: scopes, nearest_space_id: ctx.space_id !== "bootstrap" ? `spc_${ctx.space_id}` : undefined },
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
  if (hasCapability(caps, ["space:write", "flow:run"])) return "agent";

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

function bareRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id.slice(4) : run_id;
}

function bareSpaceId(id: string): string {
  return id.startsWith("spc_") ? id.slice(4) : id;
}

export interface AssignmentScope {
  run_id: string;
  step_id: string;
  /** Bare run space id (`run.space_id`); omitted to skip the space boundary. */
  space_id?: string;
}

/**
 * Enforce the assignment boundary for an ephemeral resolve token on every
 * endpoint reachable with `step:resolve`.
 *
 * Ephemeral tokens minted per `shell_spawn` dispatch carry a `scope_ref`
 * (`{run_id}:{step_id}[:{handler_id}]`) and a `harness_id` of `run:{run_id}`.
 * Such a token may only act for its own run/step/space — never another active
 * run/step, and never another space. A step binds exactly one handler, so the
 * run:step assignment identity implies the handler; the optional handler
 * segment is carried on the token for audit/binding and not re-checked here
 * (route handlers are step-keyed and do not receive a handler parameter).
 *
 * Non-ephemeral grant tokens (no `scope_ref`, no `run:` harness_id) carry only
 * the space boundary, preserving human/agent submission to any step in their
 * own space. Returns a 403 Response on any mismatch, else null.
 */
export function requireAssignmentScope(
  ctx: TokenContext,
  scope: AssignmentScope,
): Response | null {
  if (scope.space_id && ctx.space_id !== "bootstrap") {
    if (bareSpaceId(ctx.space_id) !== bareSpaceId(scope.space_id)) {
      return denialResponse(MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE, {
        message: "Token is not scoped to this space",
        hint: { nearest_space_id: `spc_${bareSpaceId(ctx.space_id)}` },
      });
    }
  }

  if (ctx.harness_id?.startsWith("run:")) {
    const tokenRun = ctx.harness_id.slice("run:".length);
    if (tokenRun !== scope.run_id && tokenRun !== bareRunId(scope.run_id)) {
      return denialResponse("TOKEN_RUN_SCOPE_MISMATCH", {
        message: "Token is not scoped to this run",
      });
    }
  }

  if (ctx.scope_ref) {
    const segments = ctx.scope_ref.split(":");
    const tokenRun = segments[0];
    const tokenStep = segments[1];
    const runMatches =
      tokenRun === scope.run_id || tokenRun === bareRunId(scope.run_id);
    if (!runMatches || tokenStep !== scope.step_id) {
      return denialResponse("TOKEN_STEP_SCOPE_MISMATCH", {
        message: "Token is not scoped to this step",
      });
    }
  }

  return null;
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
