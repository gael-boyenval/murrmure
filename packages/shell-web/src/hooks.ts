import { createHubClient } from "@murrmure/hub-client";
import { useMemo } from "react";
import { getStorageItem, migrateLegacyStorage, setStorageItem } from "./storage.js";

const DEFAULT_HUB_URL = "http://127.0.0.1:8787";
const LOCAL_HUB_URLS = new Set(["http://127.0.0.1:8787", "http://localhost:8787"]);

migrateLegacyStorage();

export function isBundledShell(envValue = import.meta.env?.VITE_MURRMURE_BUNDLED): boolean {
  return envValue === "1";
}

export function resolveHubUrl(
  storedHubUrl: string | null | undefined,
  bundled: boolean,
  origin: string,
): string {
  if (bundled) {
    return origin.replace(/\/$/, "");
  }
  const stored = storedHubUrl?.trim();
  return stored ? stored.replace(/\/$/, "") : DEFAULT_HUB_URL;
}

/** Hub URL for MCP snippets and flow iframes (may be direct daemon port). */
export function getStoredHubUrl(): string {
  const origin = typeof window === "undefined" ? DEFAULT_HUB_URL : window.location.origin;
  return resolveHubUrl(getStorageItem("murrmure_hub_url"), isBundledShell(), origin);
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
