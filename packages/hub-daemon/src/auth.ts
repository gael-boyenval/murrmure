import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { addTokenId, stripTokenId } from "@murrmure/hub-core";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";

export interface TokenContext {
  token_id: string;
  actor_id: string;
  space_id: string;
  scopes: string[];
  harness_id?: string;
  flow_acl?: string[];
  /** Assignment scope reference (`{run_id}:{step_id}`) for resolve tokens. */
  scope_ref?: string;
  /**
   * Consumer space a federated resolve token is bound to. The producer bytes
   * endpoint binds the artifact ACL principal to this instead of trusting an
   * arbitrary `?space_id=` claim.
   */
  consumer_space_id?: string;
}

export function parseBearer(req: Request): string | undefined {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return undefined;
  const bare = auth.slice(7);
  return bare.startsWith("tok_") ? bare : addTokenId(bare);
}

/** Session cookie set by shell/Desktop — enables view iframe asset loads (no Bearer on navigation). */
export function parseCookieToken(req: Request): string | undefined {
  const header = req.headers.get("Cookie");
  if (!header) return undefined;
  const match = header.match(/(?:^|;\s*)murrmure_token=([^;]*)/);
  const raw = match?.[1]?.trim();
  if (!raw) return undefined;
  try {
    const value = decodeURIComponent(raw);
    if (!value) return undefined;
    return value.startsWith("tok_") ? value : addTokenId(value);
  } catch {
    return undefined;
  }
}

export function parseSessionToken(req: Request): string | undefined {
  return parseBearer(req) ?? parseCookieToken(req);
}

export async function requireToken(
  studio: StudioPersistencePort,
  req: Request,
  pathSpaceId?: string,
): Promise<TokenContext | Response> {
  const tokenId = parseSessionToken(req);
  if (!tokenId) {
    return json403(MURRMURE_DENIAL_CODES.TOKEN_DENIED);
  }

  const token = await studio.getToken(stripTokenId(tokenId));
  if (!token || token.status !== "active") {
    return json403(MURRMURE_DENIAL_CODES.TOKEN_DENIED);
  }

  // Ephemeral assignment credentials carry an expiry backstop; an expired
  // active token is treated as denied (revocation handles the normal path).
  if (token.expires_at) {
    const expiry = Date.parse(token.expires_at);
    if (Number.isFinite(expiry) && expiry <= Date.now()) {
      return json403(MURRMURE_DENIAL_CODES.TOKEN_DENIED);
    }
  }

  if (pathSpaceId) {
    const barePath = pathSpaceId.startsWith("spc_") ? pathSpaceId.slice(4) : pathSpaceId;
    if (token.space_id !== "bootstrap" && token.space_id !== barePath) {
      return json403(MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE, {
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
    flow_acl: token.flow_acl,
    scope_ref: token.scope_ref,
    consumer_space_id: token.consumer_space_id,
  };
}

function json403(code: string, extra?: Record<string, unknown>): Response {
  const message =
    code === MURRMURE_DENIAL_CODES.TOKEN_DENIED
      ? "Invalid or revoked token"
      : code === MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE
        ? "Token not valid for this space or action"
        : "Access denied";
  return new Response(JSON.stringify({ code, message, ...extra }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
}
