import { homedir } from "node:os";
import { join } from "node:path";
export function murrmureFlowsRoot(): string {
  return join(homedir(), ".murrmure", "flows");
}

export function stagePath(flowId: string, version: string): string {
  return join(murrmureFlowsRoot(), flowId, version);
}

export function sharedHubsPath(): string {
  return join(homedir(), ".murrmure", "hubs", "shared.json");
}
