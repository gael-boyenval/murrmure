import { syncAuthCookie } from "./auth-cookie.js";

const LEGACY_KEYS: Record<string, string> = {
  murrmure_hub_url: "murrmure_hub_url",
  murrmure_token: "murrmure_token",
  murrmure_setup_complete: "murrmure_setup_complete",
  murrmure_active_space: "murrmure_active_space",
};

let migrated = false;

/** One-time migration from legacy `studio_*` localStorage keys. */
export function migrateLegacyStorage(): void {
  if (migrated || typeof localStorage === "undefined") return;
  migrated = true;
  for (const [legacyKey, key] of Object.entries(LEGACY_KEYS)) {
    const legacy = localStorage.getItem(legacyKey);
    if (legacy !== null && localStorage.getItem(key) === null) {
      localStorage.setItem(key, legacy);
    }
  }
}

export function getStorageItem(key: string): string | null {
  migrateLegacyStorage();
  return localStorage.getItem(key);
}

export function setStorageItem(key: string, value: string): void {
  migrateLegacyStorage();
  localStorage.setItem(key, value);
  if (key === LEGACY_KEYS.murrmure_token) {
    syncAuthCookie(value);
  }
}
