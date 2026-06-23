import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function studioCapabilitiesRoot(): string {
  return join(homedir(), ".studio", "capabilities");
}

/** Repo-local reference capabilities used by `init --from-example`. */
export function examplesRoot(): string {
  return fileURLToPath(new URL("../../../examples/capabilities", import.meta.url));
}

export function stagePath(packageId: string, version: string): string {
  return join(studioCapabilitiesRoot(), packageId, version);
}

export function pushStatePath(packageId: string, version: string): string {
  return join(stagePath(packageId, version), ".push-state.json");
}

export function sharedHubsPath(): string {
  return join(homedir(), ".studio", "hubs", "shared.json");
}
