import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SHARED_DISCOVERY_RELATIVE_PATH = ".murrmure/hubs/shared.json";

interface SharedHubEntry {
  endpoint?: unknown;
}

interface SharedDiscoveryFile {
  hubs?: unknown;
  url?: unknown;
}

export interface HubDiscoveryResult {
  endpoint: string;
  sharedPath: string;
}

function normalizeEndpoint(endpoint: string): string | null {
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function parseSharedDiscovery(raw: string, sharedPath: string): SharedDiscoveryFile {
  try {
    return JSON.parse(raw) as SharedDiscoveryFile;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`Invalid hub discovery JSON at ${sharedPath}: ${detail}`);
  }
}

export function resolveSharedDiscoveryPath(homePath: string = homedir()): string {
  return join(homePath, SHARED_DISCOVERY_RELATIVE_PATH);
}

export function discoverHubEndpoint(options?: {
  homePath?: string;
  sharedPath?: string;
}): HubDiscoveryResult {
  const sharedPath = options?.sharedPath ?? resolveSharedDiscoveryPath(options?.homePath);
  if (!existsSync(sharedPath)) {
    throw new Error(
      `Missing hub discovery file at ${sharedPath}. Start Murrmure Desktop or hub daemon first.`,
    );
  }

  const parsed = parseSharedDiscovery(readFileSync(sharedPath, "utf-8"), sharedPath);
  const endpoints: string[] = [];
  if (Array.isArray(parsed.hubs)) {
    for (const candidate of parsed.hubs as SharedHubEntry[]) {
      if (candidate && typeof candidate.endpoint === "string") {
        endpoints.push(candidate.endpoint);
      }
    }
  }
  if (typeof parsed.url === "string") {
    endpoints.push(parsed.url);
  }

  for (const endpoint of endpoints) {
    const normalized = normalizeEndpoint(endpoint);
    if (normalized) {
      return { endpoint: normalized, sharedPath };
    }
  }

  throw new Error(
    `No usable hub endpoint found in ${sharedPath}. Expected hubs[0].endpoint (or legacy url).`,
  );
}
