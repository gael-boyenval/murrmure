import { resolveHubAuth, type HubAuth } from "../auth.js";
import { getAuthContext } from "./auth-context.js";
import type { GlobalFlags } from "./flags.js";
import { printErr, printScopeError } from "./output.js";
import {
  requireAnyScope,
  requireScope,
  requireTokenForSpace,
  type AuthContext,
} from "./scope.js";
import { assertSpaceId } from "./space-id.js";

export type ScopePreflight = {
  auth: HubAuth;
  spaceId: string;
  ctx: AuthContext;
};

export type TokenPreflight = ScopePreflight;

export async function runGlobalScopePreflight(
  flags: GlobalFlags,
  requiredScope: string,
): Promise<{ auth: HubAuth; ctx: AuthContext }> {
  const auth = resolveHubAuth({ hubUrl: flags.hubUrl, token: flags.token });
  if ("error" in auth) {
    printErr("AUTH_MISSING", auth.error);
  }

  const ctxResult = await getAuthContext(auth);
  if ("error" in ctxResult) {
    printErr(
      ctxResult.status === 401 ? "AUTH_INVALID" : "HUB_ERROR",
      ctxResult.error,
    );
  }

  const scopeErr = requireAnyScope(ctxResult, requiredScope);
  if (scopeErr) {
    printScopeError(scopeErr);
  }

  return { auth, ctx: ctxResult };
}

export async function runScopePreflight(
  flags: GlobalFlags,
  requiredScope: string,
  positionalSpaceId?: string,
): Promise<ScopePreflight> {
  const auth = resolveHubAuth({ hubUrl: flags.hubUrl, token: flags.token });
  if ("error" in auth) {
    printErr("AUTH_MISSING", auth.error);
  }

  const spaceId = assertSpaceId(flags, positionalSpaceId);

  const ctxResult = await getAuthContext(auth);
  if ("error" in ctxResult) {
    printErr(
      ctxResult.status === 401 ? "AUTH_INVALID" : "HUB_ERROR",
      ctxResult.error,
    );
  }

  const scopeErr = requireScope(ctxResult, spaceId, requiredScope);
  if (scopeErr) {
    printScopeError(scopeErr);
  }

  return { auth, spaceId, ctx: ctxResult };
}

export function resolveHubAuthOrExit(flags: GlobalFlags): HubAuth {
  const auth = resolveHubAuth({ hubUrl: flags.hubUrl, token: flags.token });
  if ("error" in auth) {
    printErr("AUTH_MISSING", auth.error);
  }
  return auth;
}

export async function runTokenPreflight(
  flags: GlobalFlags,
  positionalSpaceId?: string,
): Promise<TokenPreflight> {
  const auth = resolveHubAuth({ hubUrl: flags.hubUrl, token: flags.token });
  if ("error" in auth) {
    printErr("AUTH_MISSING", auth.error);
  }

  const spaceId = assertSpaceId(flags, positionalSpaceId);

  const ctxResult = await getAuthContext(auth);
  if ("error" in ctxResult) {
    printErr(
      ctxResult.status === 401 ? "AUTH_INVALID" : "HUB_ERROR",
      ctxResult.error,
    );
  }

  const tokenErr = requireTokenForSpace(ctxResult, spaceId);
  if (tokenErr) {
    printScopeError(tokenErr);
  }

  return { auth, spaceId, ctx: ctxResult };
}
