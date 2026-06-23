import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DaemonConfig } from "./context.js";

export interface LockOwner {
  pid: number;
  started_at: string;
  endpoint: string;
  database_path: string;
}

export function resolveDataDir(config: DaemonConfig): string {
  return config.dataDir || join(homedir(), ".studio");
}

export interface CapabilityProject {
  package_id: string;
  source: string;
}

export interface SharedConfig {
  hubs?: unknown[];
  capabilityProjects?: CapabilityProject[];
}

function sharedConfigPath(config: DaemonConfig): string {
  return join(resolveDataDir(config), "hubs", "shared.json");
}

export function readSharedConfig(config: DaemonConfig): SharedConfig {
  const path = sharedConfigPath(config);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as SharedConfig;
  } catch {
    return {};
  }
}

/**
 * BC6b project registry: persist the capability project paths into
 * `~/.studio/hubs/shared.json` while preserving hub discovery entries.
 */
export function writeCapabilityProjects(
  config: DaemonConfig,
  projects: CapabilityProject[],
): SharedConfig {
  const hubsDir = join(resolveDataDir(config), "hubs");
  mkdirSync(hubsDir, { recursive: true });
  const next: SharedConfig = { ...readSharedConfig(config), capabilityProjects: projects };
  writeFileSync(join(hubsDir, "shared.json"), JSON.stringify(next, null, 2));
  return next;
}

export function writeDiscovery(config: DaemonConfig, port: number): void {
  const dataDir = resolveDataDir(config);
  const hubsDir = join(dataDir, "hubs");
  mkdirSync(hubsDir, { recursive: true });
  const existing = readSharedConfig(config);
  const discovery = {
    ...existing,
    hubs: [
      {
        endpoint: `http://127.0.0.1:${port}`,
        database_path: config.databasePath,
        pid: process.pid,
        started_at: new Date().toISOString(),
      },
    ],
  };
  writeFileSync(join(hubsDir, "shared.json"), JSON.stringify(discovery, null, 2));
}

export function acquireLock(config: DaemonConfig, port: number): LockOwner | Response {
  const dataDir = resolveDataDir(config);
  const lockDir = join(dataDir, "hub.lock");
  const ownerPath = join(lockDir, "owner.json");

  if (existsSync(ownerPath)) {
    try {
      const existing = JSON.parse(readFileSync(ownerPath, "utf-8")) as LockOwner;
      const started = new Date(existing.started_at).getTime();
      const stale = Date.now() - started > 30_000;
      if (!stale) {
        try {
          process.kill(existing.pid, 0);
          return new Response(
            JSON.stringify({ code: "hub_already_running", owner: existing }),
            { status: 409, headers: { "content-type": "application/json" } },
          );
        } catch {
          // pid dead — reclaim
        }
      }
    } catch {
      // corrupt lock — reclaim
    }
    rmSync(lockDir, { recursive: true, force: true });
  }

  mkdirSync(lockDir, { recursive: true });
  const owner: LockOwner = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    endpoint: `http://127.0.0.1:${port}`,
    database_path: config.databasePath,
  };
  writeFileSync(ownerPath, JSON.stringify(owner, null, 2));
  return owner;
}

export function releaseLock(config: DaemonConfig): void {
  const lockDir = join(resolveDataDir(config), "hub.lock");
  if (existsSync(lockDir)) {
    rmSync(lockDir, { recursive: true, force: true });
  }
}
