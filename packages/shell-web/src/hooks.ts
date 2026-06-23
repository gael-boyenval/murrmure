import { createHubClient } from "@murrmure/hub-client";
import { useMemo } from "react";

const LOCAL_HUB_URLS = new Set(["http://127.0.0.1:8787", "http://localhost:8787"]);

/** Hub URL for MCP snippets and capability iframes (may be direct daemon port). */
export function getStoredHubUrl(): string {
  return localStorage.getItem("studio_hub_url") ?? "http://127.0.0.1:8787";
}

/** API base for browser fetch — routes local daemon through the Vite proxy. */
export function resolveApiBaseUrl(storedHubUrl = getStoredHubUrl()): string {
  const stored = storedHubUrl.replace(/\/$/, "");
  if (typeof window === "undefined") return stored;
  if (!stored || LOCAL_HUB_URLS.has(stored)) {
    return window.location.origin;
  }
  return stored;
}

export function useClient() {
  const token = localStorage.getItem("studio_token") ?? "";
  return useMemo(() => {
    if (!token) return null;
    return createHubClient({ baseUrl: resolveApiBaseUrl(), token });
  }, [token]);
}

export function useActiveSpaceId(): string | undefined {
  const stored = localStorage.getItem("studio_active_space");
  return stored ?? undefined;
}

export function setActiveSpaceId(spaceId: string) {
  localStorage.setItem("studio_active_space", spaceId);
}
