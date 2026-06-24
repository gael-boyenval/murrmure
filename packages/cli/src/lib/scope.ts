export interface WhoamiSpace {
  space_id: string;
  scopes: string[];
}

export interface AuthContext {
  tokenScopes: string[];
  tokenSpaceId: string | "bootstrap";
  whoami: {
    spaces: WhoamiSpace[];
  };
}

export type ScopeError =
  | { code: "SCOPE_UNKNOWN_SPACE"; message: string; spaceId: string }
  | { code: "SCOPE_MISSING"; message: string; requiredScope: string; spaceId: string; scopes: string[] }
  | { code: "TOKEN_WRONG_SPACE"; message: string; spaceId: string; tokenSpaceId: string };

export function bareSpaceId(spaceId: string): string {
  return spaceId.replace(/^spc_/, "");
}

export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required) || scopes.includes("space:admin");
}

export function resolveScopesForSpace(
  ctx: AuthContext,
  spaceId: string,
): string[] | ScopeError {
  if (ctx.tokenSpaceId === "bootstrap") {
    return ctx.tokenScopes;
  }

  const match = ctx.whoami.spaces.find(
    (entry) => bareSpaceId(entry.space_id) === bareSpaceId(spaceId),
  );
  if (match) return match.scopes;

  if (ctx.whoami.spaces.length === 0) {
    if (bareSpaceId(ctx.tokenSpaceId) === bareSpaceId(spaceId)) {
      return ctx.tokenScopes;
    }
    return {
      code: "SCOPE_UNKNOWN_SPACE",
      message: `Token cannot act on space ${spaceId}`,
      spaceId,
    };
  }

  return {
    code: "SCOPE_UNKNOWN_SPACE",
    message: `Token cannot act on space ${spaceId}`,
    spaceId,
  };
}

export function requireAnyScope(
  ctx: AuthContext,
  requiredScope: string,
): void | ScopeError {
  if (ctx.tokenSpaceId === "bootstrap") return;

  if (ctx.whoami.spaces.length === 0) {
    if (hasScope(ctx.tokenScopes, requiredScope)) return;
    return {
      code: "SCOPE_MISSING",
      message: `Missing scope: ${requiredScope}`,
      requiredScope,
      spaceId: "bootstrap",
      scopes: ctx.tokenScopes,
    };
  }

  for (const entry of ctx.whoami.spaces) {
    if (hasScope(entry.scopes, requiredScope)) return;
  }

  const first = ctx.whoami.spaces[0];
  return {
    code: "SCOPE_MISSING",
    message: `Missing scope: ${requiredScope}`,
    requiredScope,
    spaceId: first.space_id,
    scopes: first.scopes,
  };
}

export function requireScope(
  ctx: AuthContext,
  spaceId: string,
  requiredScope: string,
): void | ScopeError {
  if (ctx.tokenSpaceId === "bootstrap") {
    return;
  }

  const scopes = resolveScopesForSpace(ctx, spaceId);
  if (!Array.isArray(scopes)) return scopes;

  if (hasScope(scopes, requiredScope)) return;

  return {
    code: "SCOPE_MISSING",
    message: `Missing scope: ${requiredScope}`,
    requiredScope,
    spaceId,
    scopes,
  };
}

export function requireTokenForSpace(ctx: AuthContext, spaceId: string): void | ScopeError {
  if (ctx.tokenSpaceId === "bootstrap") return;

  if (bareSpaceId(ctx.tokenSpaceId) === bareSpaceId(spaceId)) return;

  if (ctx.whoami.spaces.some((entry) => bareSpaceId(entry.space_id) === bareSpaceId(spaceId))) {
    return;
  }

  return {
    code: "TOKEN_WRONG_SPACE",
    message: `Token is not authorized for space ${spaceId}`,
    spaceId,
    tokenSpaceId: ctx.tokenSpaceId,
  };
}

export type PreflightMode = "requireScope" | "requireTokenForSpace";

export function selectPreflightMode(routeKind: "config" | "product"): PreflightMode {
  return routeKind === "config" ? "requireScope" : "requireTokenForSpace";
}
