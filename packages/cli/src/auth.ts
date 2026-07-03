import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readCredentials } from "./lib/auth-store.js";

export interface HubAuth {
  hubUrl: string;
  token: string;
  defaultSpaceId?: string;
}

export interface AuthOverrides {
  hubUrl?: string;
  token?: string;
}

export const DEFAULT_HUB_URL = "http://127.0.0.1:8787";

function normalizeHubUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function normalizeLoopbackHubUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      return undefined;
    }
    return normalizeHubUrl(parsed.toString());
  } catch {
    return undefined;
  }
}

function envAuth(): Partial<HubAuth> | null {
  const hubUrl = process.env.MURRMURE_HUB_URL;
  const token =
    process.env.MURRMURE_HUB_TOKEN ??
    process.env.MURRMURE_TOKEN ??
    process.env.MURRMURE_DEPLOY_TOKEN;

  if (!hubUrl || !token) return null;

  return {
    hubUrl: normalizeHubUrl(hubUrl),
    token,
    defaultSpaceId: process.env.MURRMURE_SPACE_ID,
  };
}

function credentialsAuth(): Partial<HubAuth> | null {
  const credentials = readCredentials();
  if (!credentials) return null;

  return {
    hubUrl: normalizeHubUrl(credentials.hubUrl),
    token: credentials.token,
    defaultSpaceId: credentials.defaultSpaceId,
  };
}

function sharedJsonAuth(): Partial<HubAuth> | null {
  const sharedPath = join(homedir(), ".murrmure", "hubs", "shared.json");
  if (!existsSync(sharedPath)) return null;

  try {
    const shared = JSON.parse(readFileSync(sharedPath, "utf-8")) as {
      url?: string;
      token?: string;
      defaultSpaceId?: string;
      hubs?: Array<{
        endpoint?: string;
      }>;
    };
    const sharedHubUrl = shared.url ?? shared.hubs?.[0]?.endpoint;
    const hubUrl = sharedHubUrl ? normalizeLoopbackHubUrl(sharedHubUrl) : undefined;
    if (!hubUrl && !shared.token && !shared.defaultSpaceId) {
      return null;
    }

    return {
      hubUrl,
      token: shared.token,
      defaultSpaceId: shared.defaultSpaceId,
    };
  } catch {
    return null;
  }
}

function pickField<T>(sources: Array<T | null | undefined>, selector: (source: T) => string | undefined): string | undefined {
  for (const source of sources) {
    if (!source) continue;
    const value = selector(source);
    if (value) return value;
  }
  return undefined;
}

export function resolveHubAuth(overrides?: AuthOverrides): HubAuth | { error: string } {
  const flagSource =
    overrides?.hubUrl || overrides?.token
      ? { hubUrl: overrides.hubUrl, token: overrides.token }
      : null;
  const sources = [flagSource, envAuth(), credentialsAuth(), sharedJsonAuth()];

  const hubUrl = pickField(sources, (source) => source.hubUrl);
  const token = pickField(sources, (source) => source.token);
  const defaultSpaceId = pickField(
    [envAuth(), credentialsAuth(), sharedJsonAuth()],
    (source) => source?.defaultSpaceId,
  );

  if (hubUrl && token) {
    return { hubUrl, token, defaultSpaceId };
  }

  return {
    error:
      "Missing hub auth — run mrmr login, or set MURRMURE_HUB_URL + MURRMURE_HUB_TOKEN (or MURRMURE_TOKEN / MURRMURE_DEPLOY_TOKEN), or ~/.murrmure/credentials",
  };
}

export async function hubFetch(
  auth: HubAuth,
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
    ...(init?.headers as Record<string, string> | undefined),
  };
  let body = init?.body;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  return fetch(`${auth.hubUrl}${path}`, { ...init, headers, body });
}
