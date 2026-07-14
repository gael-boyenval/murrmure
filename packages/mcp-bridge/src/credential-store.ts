import { spawnSync } from "node:child_process";

const KEYCHAIN_SERVICE = "dev.murrmure.connection";

function accountFor(hubId: string, connectionId: string): string {
  return `${encodeURIComponent(hubId)}::${connectionId}`;
}

export function readMacOsConnectionToken(
  hubId: string,
  connectionId: string,
): string {
  if (process.platform !== "darwin") {
    throw new Error(
      "Local credential lookup is unsupported on this platform; packaged Desktop connections are macOS-only in this release.",
    );
  }
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
    const detail = (result.stderr ?? "").toLowerCase();
    if (
      detail.includes("interaction is not allowed") ||
      detail.includes("user interaction is not allowed") ||
      detail.includes("locked")
    ) {
      throw new Error(
        `Credential store is locked for connection ${connectionId}; unlock Keychain and reload the MCP client.`,
      );
    }
    if (detail.includes("could not be found") || result.status === 44) {
      throw new Error(
        `Credential is missing for connection ${connectionId}; create or rotate the connection.`,
      );
    }
    throw new Error(
      `Credential store lookup failed for connection ${connectionId}.`,
    );
  }
  const token = result.stdout.trim();
  if (!token) {
    throw new Error(`Credential is missing for connection ${connectionId}.`);
  }
  return token;
}
