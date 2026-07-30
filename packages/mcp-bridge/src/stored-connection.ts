import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface StoredConnection {
  hub_id: string;
  connection_id: string;
  space_id: string;
  profile: string;
  status?: string;
}

export function resolveStoredConnectionPath(
  connectionId: string,
  homePath: string = homedir(),
): string {
  return join(homePath, ".murrmure", "connections", "by-id", `${connectionId}.json`);
}

export function readStoredConnection(
  connectionId: string,
  homePath: string = homedir(),
): StoredConnection | null {
  const path = resolveStoredConnectionPath(connectionId, homePath);
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredConnection>;
    if (
      typeof value.hub_id !== "string" ||
      typeof value.connection_id !== "string" ||
      typeof value.space_id !== "string" ||
      typeof value.profile !== "string"
    ) {
      return null;
    }
    return value as StoredConnection;
  } catch {
    return null;
  }
}
