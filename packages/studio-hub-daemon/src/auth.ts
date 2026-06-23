import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { addTokenId, stripTokenId } from "@murrmure/hub-core";
import { STUDIO_DENIAL_CODES } from "@murrmure/contracts";

export interface TokenContext {
  token_id: string;
  actor_id: string;
  space_id: string;
  scopes: string[];
  harness_id?: string;
  capability_acl?: string[];
}

export function parseBearer(req: Request): string | undefined {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return undefined;
  const bare = auth.slice(7);
  return bare.startsWith("tok_") ? bare : addTokenId(bare);
}

export async function requireToken(
  studio: StudioPersistencePort,
  req: Request,
  pathSpaceId?: string,
): Promise<TokenContext | Response> {
  const tokenId = parseBearer(req);
  if (!tokenId) {
    return json403(STUDIO_DENIAL_CODES.TOKEN_DENIED);
  }

  const token = await studio.getToken(stripTokenId(tokenId));
  if (!token || token.status !== "active") {
    return json403(STUDIO_DENIAL_CODES.TOKEN_DENIED);
  }

  if (pathSpaceId) {
    const barePath = pathSpaceId.startsWith("spc_") ? pathSpaceId.slice(4) : pathSpaceId;
    if (token.space_id !== "bootstrap" && token.space_id !== barePath) {
      return json403(STUDIO_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE, {
        hint: { nearest_space_id: `spc_${token.space_id}` },
      });
    }
  }

  return {
    token_id: tokenId,
    actor_id: token.actor_id,
    space_id: token.space_id,
    scopes: token.scopes,
    harness_id: token.harness_id,
    capability_acl: token.capability_acl,
  };
}

function json403(code: string, extra?: Record<string, unknown>): Response {
  const message =
    code === STUDIO_DENIAL_CODES.TOKEN_DENIED
      ? "Invalid or revoked token"
      : code === STUDIO_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE
        ? "Token not valid for this space or action"
        : "Access denied";
  return new Response(JSON.stringify({ code, message, ...extra }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
}
