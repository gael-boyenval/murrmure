import type { PolicyPort, PolicyResult } from "@murrmure/runtime-contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import { stripSpaceId, stripTokenId } from "../bridge/ids.js";

export interface PolicyContext {
  space_id: string;
  token_id: string;
  actor_id: string;
  command_kind: string;
  harness_claim?: string;
}

const SCOPE_MAP: Record<string, string> = {
  "space.create": "space:admin",
  "instance.create": "flow:install",
  "aggregate.create": "flow:install",
  "state.transition": "state:transition",
  "gate.resolve": "state:transition",
  "event.append": "event:emit",
  "wait.register": "space:read",
  "wait.cancel": "space:read",
  "grant.mint": "space:admin",
  "grant.revoke": "space:admin",
  "trigger.register": "trigger:register",
  "trigger.schedule": "trigger:register",
  "blob.write": "blob:write",
  "query.ask": "space:read",
  "query.answer": "space:read",
  "federation.emit": "federation:emit",
  "instance.metadata.patch": "state:transition",
};

export function createStudioPolicyPort(studio: StudioPersistencePort): PolicyPort {
  return {
    evaluate: async (ctx): Promise<PolicyResult> => {
      const token = await studio.getToken(ctx.credential_id);
      if (!token || token.status !== "active") {
        return {
          allowed: false,
          denial: {
            code: MURRMURE_DENIAL_CODES.TOKEN_DENIED,
            message: "Invalid or revoked token",
            retryable: false,
          },
        };
      }

      if (token.space_id !== "bootstrap" && token.space_id !== ctx.scope_id) {
        return {
          allowed: false,
          denial: {
            code: MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE,
            message: "Token not scoped to this space",
            retryable: false,
          },
        };
      }

      if (token.harness_id === "human_only" && ctx.actor_kind === "agent") {
        return {
          allowed: false,
          denial: {
            code: MURRMURE_DENIAL_CODES.HARNESS_MISMATCH,
            message: "Agent token cannot act in human_only harness",
            retryable: false,
          },
        };
      }

      if (token.harness_id && ctx.actor_kind === "agent") {
        const claim = (ctx.payload as { harness?: string } | undefined)?.harness;
        if (claim && claim !== token.harness_id) {
          return {
            allowed: false,
            denial: {
              code: MURRMURE_DENIAL_CODES.HARNESS_MISMATCH,
              message: "Harness mismatch",
              retryable: false,
            },
          };
        }
      }

      const requiredScope = SCOPE_MAP[ctx.command_kind];
      if (requiredScope && !token.scopes.includes(requiredScope) && !token.scopes.includes("space:admin")) {
        const domainCreate =
          (ctx.command_kind === "aggregate.create" || ctx.command_kind === "instance.create") &&
          token.scopes.includes("state:transition");
        if (!domainCreate) {
          return {
            allowed: false,
            denial: {
              code: MURRMURE_DENIAL_CODES.TOKEN_DENIED,
              message: `Missing scope: ${requiredScope}`,
              retryable: false,
            },
          };
        }
      }

      return { allowed: true };
    },
  };
}

export async function enforceSpacePath(
  studio: StudioPersistencePort,
  pathSpaceId: string,
  tokenId: string,
): Promise<PolicyResult> {
  const token = await studio.getToken(stripTokenId(tokenId));
  if (!token) {
    return {
      allowed: false,
      denial: { code: MURRMURE_DENIAL_CODES.TOKEN_DENIED, message: "Unknown token", retryable: false },
    };
  }

  const barePath = stripSpaceId(pathSpaceId);
  if (token.space_id !== "bootstrap" && token.space_id !== barePath) {
    return {
      allowed: false,
      denial: {
        code: MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE,
        message: "Path space does not match token scope",
        retryable: false,
      },
    };
  }

  return { allowed: true };
}
