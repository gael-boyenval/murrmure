import type { PolicyPort, PolicyResult } from "@murrmure/runtime-contracts";
import type { Capability } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import { stripSpaceId, stripTokenId } from "../bridge/ids.js";
import { hasCapability, resolveEffectiveCapabilities } from "../grants/migrate.js";

export interface PolicyContext {
  space_id: string;
  token_id: string;
  actor_id: string;
  command_kind: string;
  harness_claim?: string;
}

const CAPABILITY_MAP: Record<string, Capability | Capability[]> = {
  "space.create": "hub:admin",
  "instance.create": "flow:run",
  "aggregate.create": "flow:run",
  "state.transition": "flow:run",
  "gate.resolve": "gate:resolve",
  "event.append": "action:invoke",
  "wait.register": "space:read",
  "wait.cancel": "space:read",
  "grant.mint": "hub:admin",
  "grant.revoke": "hub:admin",
  "trigger.register": "space:write",
  "trigger.schedule": "space:write",
  "blob.write": "space:write",
  "query.ask": "space:read",
  "query.answer": "space:read",
  "federation.emit": "hub:admin",
  "instance.metadata.patch": "flow:run",
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

      const effective = resolveEffectiveCapabilities({
        scopes: token.scopes,
        capabilities: token.capabilities,
      });

      const required = CAPABILITY_MAP[ctx.command_kind];
      if (required && !hasCapability(effective, required)) {
        const requiredLabel = Array.isArray(required) ? required.join("|") : required;
        return {
          allowed: false,
          denial: {
            code: MURRMURE_DENIAL_CODES.TOKEN_DENIED,
            message: `Missing capability: ${requiredLabel}`,
            retryable: false,
          },
        };
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
