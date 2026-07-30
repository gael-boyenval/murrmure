import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ActiveConnection {
  hub_id: string;
  connection_id: string;
  space_id: string;
  profile: string;
}

export function resolveActiveConnectionPath(homePath: string = homedir()): string {
  return join(homePath, ".murrmure", "connections", "active.json");
}

export function readActiveConnection(homePath: string = homedir()): ActiveConnection | null {
  const path = resolveActiveConnectionPath(homePath);
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<ActiveConnection>;
    if (
      typeof value.hub_id !== "string" ||
      typeof value.connection_id !== "string" ||
      typeof value.space_id !== "string" ||
      typeof value.profile !== "string"
    ) {
      return null;
    }
    return value as ActiveConnection;
  } catch {
    return null;
  }
}
