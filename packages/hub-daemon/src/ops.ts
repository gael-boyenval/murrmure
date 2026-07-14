import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  return config.dataDir || join(homedir(), ".murrmure");
}

export interface FlowProject {
  flow_id: string;
  source: string;
}

export interface SharedConfig {
  hubs?: unknown[];
  flowProjects?: FlowProject[];
  mcp_bridge?: {
    command?: string;
    entry?: string;
    runtime?: string;
  };
}

function sharedConfigPath(config: DaemonConfig): string {
  return join(resolveDataDir(config), "hubs", "shared.json");
}

function lockDirPath(config: DaemonConfig): string {
  return join(resolveDataDir(config), "hub.lock");
}

function lockOwnerPath(config: DaemonConfig): string {
  return join(lockDirPath(config), "owner.json");
}

function resolveDiscoveryHost(config: DaemonConfig): string {
  const host = config.listenHost ?? "127.0.0.1";
  if (host === "0.0.0.0" || host === "::") {
    return "127.0.0.1";
  }
  return host;
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
 * BC6b project registry: persist flow project paths into
 * `~/.murrmure/hubs/shared.json` while preserving hub discovery entries.
 */
export function writeFlowProjects(
  config: DaemonConfig,
  projects: FlowProject[],
): SharedConfig {
  const hubsDir = join(resolveDataDir(config), "hubs");
  mkdirSync(hubsDir, { recursive: true });
  const next: SharedConfig = { ...readSharedConfig(config), flowProjects: projects };
  writeFileSync(join(hubsDir, "shared.json"), JSON.stringify(next, null, 2));
  return next;
}

export function writeDiscovery(config: DaemonConfig, port: number): void {
  const dataDir = resolveDataDir(config);
  const hubsDir = join(dataDir, "hubs");
  mkdirSync(hubsDir, { recursive: true });
  const existing = readSharedConfig(config);
  const endpointHost = resolveDiscoveryHost(config);
  const discovery: SharedConfig = {
    ...existing,
    hubs: [
      {
        endpoint: `http://${endpointHost}:${port}`,
        database_path: config.databasePath,
        pid: process.pid,
        started_at: new Date().toISOString(),
      },
    ],
  };
  const mcpBridgeEntry = process.env.MURRMURE_MCP_BRIDGE_ENTRY?.trim();
  if (mcpBridgeEntry) {
    discovery.mcp_bridge = {
      command:
        process.env.MURRMURE_MCP_BRIDGE_COMMAND?.trim() || "murrmure-mcp",
      entry: mcpBridgeEntry,
      runtime:
        process.env.MURRMURE_MCP_BRIDGE_RUNTIME?.trim() || process.execPath,
    };
  }
  writeFileSync(join(hubsDir, "shared.json"), JSON.stringify(discovery, null, 2));
}

export async function checkHubHealth(endpoint: string, timeoutMs = 1_500): Promise<boolean> {
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const healthUrl = new URL("/v1/health", endpoint).toString();
    const response = await fetch(healthUrl, { method: "GET", signal });
    return response.ok;
  } catch {
    return false;
  }
}

export async function acquireLock(config: DaemonConfig, port: number): Promise<LockOwner | Response> {
  const lockDir = lockDirPath(config);
  const ownerPath = lockOwnerPath(config);

  if (existsSync(ownerPath)) {
    try {
      const existing = JSON.parse(readFileSync(ownerPath, "utf-8")) as LockOwner;
      let pidAlive = false;
      try {
        process.kill(existing.pid, 0);
        pidAlive = true;
      } catch {
        // pid dead — reclaim
      }

      if (pidAlive) {
        const healthOk = await checkHubHealth(existing.endpoint);
        if (healthOk) {
          return new Response(
            JSON.stringify({ code: "hub_already_running", owner: existing }),
            { status: 409, headers: { "content-type": "application/json" } },
          );
        }
      }
    } catch {
      // corrupt lock — reclaim
    }
    rmSync(lockDir, { recursive: true, force: true });
  }

  mkdirSync(lockDir, { recursive: true });
  const endpointHost = resolveDiscoveryHost(config);
  const owner: LockOwner = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    endpoint: `http://${endpointHost}:${port}`,
    database_path: config.databasePath,
  };
  writeFileSync(ownerPath, JSON.stringify(owner, null, 2));
  return owner;
}

export function updateLockOwnerEndpoint(config: DaemonConfig, port: number): void {
  const ownerPath = lockOwnerPath(config);
  if (!existsSync(ownerPath)) {
    return;
  }
  try {
    const owner = JSON.parse(readFileSync(ownerPath, "utf-8")) as LockOwner;
    if (owner.pid !== process.pid) {
      return;
    }
    owner.endpoint = `http://${resolveDiscoveryHost(config)}:${port}`;
    writeFileSync(ownerPath, JSON.stringify(owner, null, 2));
  } catch {
    // best-effort lock metadata update
  }
}

export function cleanupStaleStaging(dataDir: string, maxAgeDays = 7): void {
  const stagingDir = join(dataDir, "staging");
  if (!existsSync(stagingDir)) {
    return;
  }
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  for (const entry of readdirSync(stagingDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const entryPath = join(stagingDir, entry.name);
    try {
      const stats = statSync(entryPath);
      if (stats.mtimeMs < cutoff) {
        rmSync(entryPath, { recursive: true, force: true });
      }
    } catch {
      // best-effort cleanup
    }
  }
}

export function releaseLock(config: DaemonConfig): void {
  const lockDir = lockDirPath(config);
  if (existsSync(lockDir)) {
    rmSync(lockDir, { recursive: true, force: true });
  }
}
