import { migrateLegacyStorage, getStorageItem, setStorageItem } from "./storage.js";

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

export function getStoredHubUrl(): string {
  const origin = typeof window === "undefined" ? DEFAULT_HUB_URL : window.location.origin;
  return resolveHubUrl(getStorageItem("murrmure_hub_url"), isBundledShell(), origin);
}

export function resolveApiBaseUrl(storedHubUrl = getStoredHubUrl()): string {
  const stored = storedHubUrl.replace(/\/$/, "");
  if (typeof window === "undefined") return stored;
  if (!stored || LOCAL_HUB_URLS.has(stored)) {
    return window.location.origin;
  }
  return stored;
}

export function getShellToken(): string {
  return getStorageItem("murrmure_token") ?? "";
}

export function useActiveSpaceId(): string | undefined {
  const stored = getStorageItem("murrmure_active_space");
  return stored ?? undefined;
}

export function setActiveSpaceId(spaceId: string) {
  setStorageItem("murrmure_active_space", spaceId);
}

export function getHubBaseUrl(): string {
  return resolveApiBaseUrl();
}

export { getStorageItem, setStorageItem };
