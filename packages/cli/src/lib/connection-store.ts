import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const KEYCHAIN_SERVICE = "dev.murrmure.connection";

export type CredentialStoreFailure =
  | "unsupported_platform"
  | "credential_missing"
  | "credential_store_locked"
  | "credential_store_error";

export class CredentialStoreError extends Error {
  constructor(
    readonly code: CredentialStoreFailure,
    message: string,
  ) {
    super(message);
    this.name = "CredentialStoreError";
  }
}

export interface ActiveConnection {
  hub_id: string;
  connection_id: string;
  space_id: string;
  profile: string;
}

export interface StoredConnection extends ActiveConnection {
  status: "active" | "revoked";
}

function accountFor(hubId: string, connectionId: string): string {
  return `${encodeURIComponent(hubId)}::${connectionId}`;
}

function classifySecurityFailure(stderr: string, status: number | null): CredentialStoreFailure {
  const detail = stderr.toLowerCase();
  if (detail.includes("could not be found") || status === 44) {
    return "credential_missing";
  }
  if (
    detail.includes("interaction is not allowed") ||
    detail.includes("user interaction is not allowed") ||
    detail.includes("locked")
  ) {
    return "credential_store_locked";
  }
  return "credential_store_error";
}

function assertMacOs(): void {
  if (process.platform !== "darwin") {
    throw new CredentialStoreError(
      "unsupported_platform",
      "Local connection credentials are supported by packaged Desktop on macOS only in this release.",
    );
  }
}

export function storeConnectionToken(
  hubId: string,
  connectionId: string,
  token: string,
): void {
  assertMacOs();
  if (!token.trim()) {
    throw new CredentialStoreError(
      "credential_store_error",
      "Refusing to store an empty connection credential.",
    );
  }
  // `security add-generic-password -w` takes the password as the next argv
  // (stdin is ignored). Passing via stdin left empty Keychain items that
  // made MCP fail with "Credential is missing".
  const result = spawnSync(
    "/usr/bin/security",
    [
      "add-generic-password",
      "-U",
      "-a",
      accountFor(hubId, connectionId),
      "-s",
      KEYCHAIN_SERVICE,
      "-l",
      `Murrmure ${connectionId}`,
      "-w",
      token,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  if (result.status !== 0) {
    const stderr = result.stderr ?? "";
    throw new CredentialStoreError(
      classifySecurityFailure(stderr, result.status),
      "Could not store the connection credential in macOS Keychain.",
    );
  }
}

export function readConnectionToken(hubId: string, connectionId: string): string {
  assertMacOs();
  const result = spawnSync(
    "/usr/bin/security",
    [
      "find-generic-password",
      "-a",
      accountFor(hubId, connectionId),
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) {
    const stderr = result.stderr ?? "";
    throw new CredentialStoreError(
      classifySecurityFailure(stderr, result.status),
      `No usable credential is available for connection ${connectionId}.`,
    );
  }
  const token = result.stdout.trim();
  if (!token) {
    throw new CredentialStoreError(
      "credential_missing",
      `No usable credential is available for connection ${connectionId}.`,
    );
  }
  return token;
}

export function deleteConnectionToken(hubId: string, connectionId: string): void {
  assertMacOs();
  const result = spawnSync(
    "/usr/bin/security",
    [
      "delete-generic-password",
      "-a",
      accountFor(hubId, connectionId),
      "-s",
      KEYCHAIN_SERVICE,
    ],
    { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] },
  );
  if (result.status !== 0 && classifySecurityFailure(result.stderr ?? "", result.status) !== "credential_missing") {
    throw new CredentialStoreError(
      classifySecurityFailure(result.stderr ?? "", result.status),
      `Could not remove the credential for connection ${connectionId}.`,
    );
  }
}

export function activeConnectionPath(homePath: string = homedir()): string {
  return join(homePath, ".murrmure", "connections", "active.json");
}

function storedConnectionPath(
  connectionId: string,
  homePath: string = homedir(),
): string {
  return join(homePath, ".murrmure", "connections", "by-id", `${connectionId}.json`);
}

export function writeStoredConnection(
  connection: StoredConnection,
  homePath: string = homedir(),
): string {
  const path = storedConnectionPath(connection.connection_id, homePath);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(connection, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  return path;
}

export function readStoredConnection(
  connectionId: string,
  homePath: string = homedir(),
): StoredConnection | null {
  const path = storedConnectionPath(connectionId, homePath);
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredConnection>;
    if (
      value.connection_id !== connectionId ||
      typeof value.hub_id !== "string" ||
      typeof value.space_id !== "string" ||
      typeof value.profile !== "string" ||
      (value.status !== "active" && value.status !== "revoked")
    ) {
      return null;
    }
    return value as StoredConnection;
  } catch {
    return null;
  }
}

/** Active (non-revoked) stored connections, oldest → newest by mtime. */
export function listStoredConnections(homePath: string = homedir()): StoredConnection[] {
  const dir = join(homePath, ".murrmure", "connections", "by-id");
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir)
    .filter((name) => name.startsWith("con_") && name.endsWith(".json"))
    .map((name) => {
      const path = join(dir, name);
      return { path, name, mtime: statSync(path).mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime);
  const out: StoredConnection[] = [];
  for (const entry of entries) {
    const connectionId = entry.name.replace(/\.json$/, "");
    const stored = readStoredConnection(connectionId, homePath);
    if (stored && stored.status === "active") out.push(stored);
  }
  return out;
}

export function writeActiveConnection(
  active: ActiveConnection,
  homePath: string = homedir(),
): string {
  const path = activeConnectionPath(homePath);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(active, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  return path;
}

export function readActiveConnection(homePath: string = homedir()): ActiveConnection | null {
  const path = activeConnectionPath(homePath);
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
