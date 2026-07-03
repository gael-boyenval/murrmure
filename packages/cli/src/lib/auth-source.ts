import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AuthOverrides } from "../auth.js";
import { readCredentials } from "./auth-store.js";

export type AuthSource = "flags" | "env" | "credentials" | "shared.json";

function envAuthPresent(): boolean {
  const hubUrl = process.env.MURRMURE_HUB_URL;
  const token =
    process.env.MURRMURE_HUB_TOKEN ??
    process.env.MURRMURE_TOKEN ??
    process.env.MURRMURE_DEPLOY_TOKEN;
  return Boolean(hubUrl && token);
}

function credentialsAuthPresent(): boolean {
  return readCredentials() !== null;
}

function sharedJsonAuthPresent(): boolean {
  const sharedPath = join(homedir(), ".murrmure", "hubs", "shared.json");
  if (!existsSync(sharedPath)) return false;
  try {
    const shared = JSON.parse(readFileSync(sharedPath, "utf-8")) as {
      url?: string;
      token?: string;
    };
    return Boolean(shared.url && shared.token);
  } catch {
    return false;
  }
}

export function resolveAuthSource(overrides?: AuthOverrides): AuthSource | null {
  if (overrides?.hubUrl || overrides?.token) return "flags";
  if (envAuthPresent()) return "env";
  if (credentialsAuthPresent()) return "credentials";
  if (sharedJsonAuthPresent()) return "shared.json";
  return null;
}
