import { isBundledShell } from "./hooks.js";
import { getStorageItem, setStorageItem } from "./storage.js";

/** Apply one-shot session bootstrap from `#murrmure-bootstrap=<token>` (desktop dev launcher). */
export function applyDesktopBootstrapFromHash(options?: { bundled?: boolean }): void {
  if (typeof globalThis.location === "undefined") {
    return;
  }
  const bundled = options?.bundled ?? isBundledShell();
  if (!bundled) {
    return;
  }

  const raw = globalThis.location.hash;
  const match = /^#murrmure-bootstrap=(.+)$/.exec(raw);
  if (!match?.[1]) {
    return;
  }

  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return;
  }
  if (!token.trim()) {
    return;
  }

  setStorageItem("murrmure_token", token);
  setStorageItem("murrmure_hub_url", globalThis.location.origin);

  const setupDone = getStorageItem("murrmure_setup_complete") === "1";
  const target = setupDone ? "/configure" : "/setup";
  globalThis.history.replaceState(null, "", target);
  globalThis.location.replace(target);
}
