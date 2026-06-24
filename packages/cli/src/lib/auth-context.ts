import type { HubAuth } from "../auth.js";
import { hubJson } from "./hub-request.js";
import type { AuthContext, WhoamiSpace } from "./scope.js";

export interface WhoamiResponse {
  actor_id: string;
  kind: string;
  token_id: string;
  spaces: WhoamiSpace[];
  expires_at?: string;
}

const CACHE_TTL_MS = 60_000;

type CacheEntry = { expiresAt: number; ctx: AuthContext };

const cache = new Map<string, CacheEntry>();

function cacheKey(auth: HubAuth): string {
  return `${auth.hubUrl}:${auth.token}`;
}

export function inferTokenMetadata(
  whoami: WhoamiResponse,
): Pick<AuthContext, "tokenScopes" | "tokenSpaceId"> {
  const { spaces } = whoami;

  if (spaces.length === 0) {
    return { tokenSpaceId: "bootstrap", tokenScopes: [] };
  }

  if (spaces.length === 1) {
    return {
      tokenSpaceId: spaces[0].space_id,
      tokenScopes: [...spaces[0].scopes],
    };
  }

  const reference = [...spaces[0].scopes].sort().join(",");
  const allIdentical = spaces.every(
    (entry) => [...entry.scopes].sort().join(",") === reference,
  );

  if (allIdentical) {
    return { tokenSpaceId: "bootstrap", tokenScopes: [...spaces[0].scopes] };
  }

  return {
    tokenSpaceId: spaces[0].space_id,
    tokenScopes: [...spaces[0].scopes],
  };
}

export function buildAuthContext(whoami: WhoamiResponse): AuthContext {
  const meta = inferTokenMetadata(whoami);
  return {
    ...meta,
    whoami: { spaces: whoami.spaces },
  };
}

export type WhoamiFailure = {
  error: string;
  status: number;
  body: unknown;
};

export async function fetchWhoami(
  auth: HubAuth,
): Promise<WhoamiResponse | WhoamiFailure> {
  const result = await hubJson<WhoamiResponse>(auth, "/v1/auth/whoami");
  if (!result.ok) {
    const body = result.body as { message?: string } | undefined;
    return {
      error: body?.message ?? `Hub returned ${result.status}`,
      status: result.status,
      body: result.body,
    };
  }
  return result.data;
}

export async function getAuthContext(
  auth: HubAuth,
  options?: { bypassCache?: boolean },
): Promise<AuthContext | { error: string; status?: number }> {
  const key = cacheKey(auth);

  if (!options?.bypassCache) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.ctx;
    }
  }

  const whoami = await fetchWhoami(auth);
  if ("error" in whoami) {
    return whoami;
  }

  const ctx = buildAuthContext(whoami);
  cache.set(key, { ctx, expiresAt: Date.now() + CACHE_TTL_MS });
  return ctx;
}

export function clearAuthContextCache(): void {
  cache.clear();
}
