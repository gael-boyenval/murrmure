import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface HubAuth {
  hubUrl: string;
  token: string;
  defaultSpaceId?: string;
}

export function resolveHubAuth(): HubAuth | { error: string } {
  const envUrl = process.env.MURRMURE_HUB_URL;
  const envToken = process.env.MURRMURE_TOKEN ?? process.env.MURRMURE_DEPLOY_TOKEN;
  if (envUrl && envToken) {
    return { hubUrl: envUrl.replace(/\/$/, ""), token: envToken, defaultSpaceId: process.env.MURRMURE_SPACE_ID };
  }

  const sharedPath = join(homedir(), ".murrmure", "hubs", "shared.json");
  if (existsSync(sharedPath)) {
    try {
      const shared = JSON.parse(readFileSync(sharedPath, "utf-8")) as {
        url?: string;
        token?: string;
        defaultSpaceId?: string;
      };
      if (shared.url && shared.token) {
        return {
          hubUrl: shared.url.replace(/\/$/, ""),
          token: shared.token,
          defaultSpaceId: shared.defaultSpaceId,
        };
      }
    } catch {
      /* fall through */
    }
  }

  return { error: "Missing hub auth — set MURRMURE_HUB_URL + MURRMURE_TOKEN or ~/.murrmure/hubs/shared.json" };
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
