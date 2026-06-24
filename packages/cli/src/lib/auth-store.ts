import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CredentialsFile {
  version: 1;
  hubUrl: string;
  token: string;
  defaultSpaceId?: string;
  savedAt: string;
}

export function credentialsPath(): string {
  return join(homedir(), ".murrmure", "credentials");
}

export function readCredentials(): CredentialsFile | null {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as CredentialsFile;
    if (parsed.version !== 1 || !parsed.hubUrl || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCredentials(credentials: CredentialsFile): void {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function deleteCredentials(): void {
  const path = credentialsPath();
  if (existsSync(path)) unlinkSync(path);
}
