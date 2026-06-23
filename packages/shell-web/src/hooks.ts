import { createHubClient } from "@murrmure/hub-client";
import { useMemo } from "react";
import { getStorageItem, migrateLegacyStorage, setStorageItem } from "./storage.js";

const LOCAL_HUB_URLS = new Set(["http://127.0.0.1:8787", "http://localhost:8787"]);

migrateLegacyStorage();

/** Hub URL for MCP snippets and flow iframes (may be direct daemon port). */
export function getStoredHubUrl(): string {
  return getStorageItem("murrmure_hub_url") ?? "http://127.0.0.1:8787";
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
  const token = getStorageItem("murrmure_token") ?? "";
  return useMemo(() => {
    if (!token) return null;
    return createHubClient({ baseUrl: resolveApiBaseUrl(), token });
  }, [token]);
}

export function useActiveSpaceId(): string | undefined {
  const stored = getStorageItem("murrmure_active_space");
  return stored ?? undefined;
}

export function setActiveSpaceId(spaceId: string) {
  setStorageItem("murrmure_active_space", spaceId);
}
