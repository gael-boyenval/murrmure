import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function murrmureFlowsRoot(): string {
  return join(homedir(), ".murrmure", "flows");
}

/** Repo-local reference capabilities used by `init --from-example`. */
export function templatesRoot(): string {
  return fileURLToPath(new URL("../templates/flows", import.meta.url));
}

export function stagePath(flowId: string, version: string): string {
  return join(murrmureFlowsRoot(), flowId, version);
}

export function pushStatePath(flowId: string, version: string): string {
  return join(stagePath(flowId, version), ".flow-push-state.json");
}

export function sharedHubsPath(): string {
  return join(homedir(), ".murrmure", "hubs", "shared.json");
}
