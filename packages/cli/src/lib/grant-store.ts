import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function grantsDir(): string {
  return join(homedir(), ".murrmure", "grants");
}

function ensureGrantsDir(): string {
  const dir = grantsDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function activeGrantPath(): string {
  return join(grantsDir(), "active");
}

export function grantTokenPath(spaceId: string): string {
  return join(grantsDir(), `${spaceId}.token`);
}

export function readGrantToken(spaceId: string): string | null {
  const path = grantTokenPath(spaceId);
  if (!existsSync(path)) return null;
  try {
    const token = readFileSync(path, "utf-8").trim();
    return token ? token : null;
  } catch {
    return null;
  }
}

export function writeGrantToken(spaceId: string, token: string): string {
  const path = grantTokenPath(spaceId);
  ensureGrantsDir();
  writeFileSync(path, `${token.trim()}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

export function readActiveGrantSpace(): string | null {
  const path = activeGrantPath();
  if (!existsSync(path)) return null;
  try {
    const value = readFileSync(path, "utf-8").trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

export function setActiveGrantSpace(spaceId: string): string {
  const path = activeGrantPath();
  ensureGrantsDir();
  writeFileSync(path, `${spaceId.trim()}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

export function resolveActiveGrantToken(): { spaceId: string; token: string } | null {
  const spaceId = readActiveGrantSpace();
  if (!spaceId) return null;
  const token = readGrantToken(spaceId);
  if (!token) return null;
  return { spaceId, token };
}
