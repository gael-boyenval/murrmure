import { existsSync, renameSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_HOST,
  DESKTOP_PORT,
  parseHubPort,
  parseShellDevPort,
  SHELL_DEV_PORT,
} from "./dev-ports.js";

export { DESKTOP_HOST, DESKTOP_PORT, SHELL_DEV_PORT } from "./dev-ports.js";

export interface DesktopPaths {
  mode: "dev" | "prod" | "dev-hmr";
  repoRoot: string | null;
  dataDir: string;
  logsDir: string;
  lockOwnerPath: string;
  hubCommand: string;
  hubArgs: string[];
  nodeBinary: string;
  hubEntry: string;
  shellStaticDir: string;
  shellWebUrl: string | null;
  bundleRoot: string;
  mcpBridgeEntry: string | null;
  hubUrl: string;
  healthUrl: string;
  port: number;
}

export interface ResolveDesktopPathsOptions {
  mode: "dev" | "prod" | "dev-hmr";
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(moduleDir, "../../..");

function resolveMcpBridgeEntry(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function inferRepoRootFromCwd(cwd: string): string | null {
  const marker = `${sep}apps${sep}desktop`;
  const markerIndex = cwd.lastIndexOf(marker);
  if (markerIndex === -1) {
    return null;
  }
  return cwd.slice(0, markerIndex);
}

export function resolveDesktopPaths(options: ResolveDesktopPathsOptions): DesktopPaths {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const mode = options.mode;
  const port = parseHubPort(env);
  const dataDir = env.MURRMURE_DATA_DIR ?? join(homedir(), ".murrmure");
  const logsDir = join(dataDir, "logs");
  const lockOwnerPath = join(dataDir, "hub.lock", "owner.json");
  const hubUrl = `http://${DESKTOP_HOST}:${port}`;
  const healthUrl = `${hubUrl}/v1/health`;

  if (mode === "dev-hmr") {
    const repoRoot = env.MURRMURE_REPO_ROOT
      ? resolve(env.MURRMURE_REPO_ROOT)
      : (inferRepoRootFromCwd(cwd) ?? defaultRepoRoot);
    const shellDevPort = parseShellDevPort(env);

    return {
      mode,
      repoRoot,
      dataDir,
      logsDir,
      lockOwnerPath,
      hubCommand: "pnpm",
      hubArgs: ["--filter", "@murrmure/hub-daemon", "dev:watch"],
      nodeBinary: env.MURRMURE_DESKTOP_NODE ?? "node",
      hubEntry: join(repoRoot, "packages/hub-daemon/src/main.ts"),
      shellStaticDir: "",
      shellWebUrl: `http://${DESKTOP_HOST}:${shellDevPort}`,
      bundleRoot: env.MURRMURE_BUNDLE_ROOT ?? join(repoRoot, "fixtures"),
      mcpBridgeEntry: resolveMcpBridgeEntry([
        env.MURRMURE_MCP_BRIDGE_ENTRY,
        join(repoRoot, "packages/mcp-bridge/dist/main.js"),
      ]),
      hubUrl,
      healthUrl,
      port,
    };
  }

  if (mode === "dev") {
    const repoRoot = env.MURRMURE_REPO_ROOT
      ? resolve(env.MURRMURE_REPO_ROOT)
      : (inferRepoRootFromCwd(cwd) ?? defaultRepoRoot);
    const nodeBinary = env.MURRMURE_DESKTOP_NODE ?? "node";
    const distHubEntry = join(repoRoot, "packages/hub-daemon/dist/main.js");
    const configuredHubEntry = env.MURRMURE_DESKTOP_HUB_ENTRY;
    const hubEntry = configuredHubEntry ?? distHubEntry;
    const usePnpmStart = !configuredHubEntry && !existsSync(distHubEntry);

    return {
      mode,
      repoRoot,
      dataDir,
      logsDir,
      lockOwnerPath,
      hubCommand: usePnpmStart ? "pnpm" : nodeBinary,
      hubArgs: usePnpmStart
        ? ["--filter", "@murrmure/hub-daemon", "start"]
        : [hubEntry],
      nodeBinary,
      hubEntry,
      shellStaticDir: env.MURRMURE_SHELL_STATIC_DIR ?? join(repoRoot, "packages/shell-web/dist"),
      shellWebUrl: null,
      bundleRoot: env.MURRMURE_BUNDLE_ROOT ?? join(repoRoot, "fixtures"),
      mcpBridgeEntry: resolveMcpBridgeEntry([
        env.MURRMURE_MCP_BRIDGE_ENTRY,
        join(repoRoot, "packages/mcp-bridge/dist/main.js"),
      ]),
      hubUrl,
      healthUrl,
      port,
    };
  }

  const executableDir = dirname(process.execPath);
  const resourcesDir = env.MURRMURE_DESKTOP_RESOURCES_DIR ?? resolve(executableDir, "../Resources");

  return {
    mode,
    repoRoot: null,
    dataDir,
    logsDir,
    lockOwnerPath,
    hubCommand: env.MURRMURE_DESKTOP_NODE ?? join(executableDir, "node"),
    hubArgs: [env.MURRMURE_DESKTOP_HUB_ENTRY ?? join(resourcesDir, "hub/main.js")],
    nodeBinary: env.MURRMURE_DESKTOP_NODE ?? join(executableDir, "node"),
    hubEntry: env.MURRMURE_DESKTOP_HUB_ENTRY ?? join(resourcesDir, "hub/main.js"),
    shellStaticDir: env.MURRMURE_SHELL_STATIC_DIR ?? join(resourcesDir, "shell/dist"),
    shellWebUrl: null,
    bundleRoot: env.MURRMURE_BUNDLE_ROOT ?? resourcesDir,
    mcpBridgeEntry: resolveMcpBridgeEntry([
      env.MURRMURE_MCP_BRIDGE_ENTRY,
      join(resourcesDir, "mcp-bridge/main.js"),
    ]),
    hubUrl,
    healthUrl,
    port,
  };
}

const LEGACY_DB_BASENAME = "studio.db";
const CANONICAL_DB_BASENAME = "murrmure.db";
/** Upper bound for a freshly created / schema-only SQLite file (bytes). */
const NEW_DB_MAX_BYTES = 8192;

function dbFileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function removeDatabaseFiles(dbPath: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const sidecar = suffix ? `${dbPath}${suffix}` : dbPath;
    if (existsSync(sidecar)) {
      unlinkSync(sidecar);
    }
  }
}

/** Prefer legacy data when canonical exists but is empty/new and legacy has real content. */
export function shouldPreferLegacyDatabaseMigration(
  canonicalPath: string,
  legacyPath: string,
): boolean {
  const legacySize = dbFileSize(legacyPath);
  if (legacySize <= 0) {
    return false;
  }
  const canonicalSize = dbFileSize(canonicalPath);
  return canonicalSize <= NEW_DB_MAX_BYTES && legacySize > canonicalSize;
}

function migrateLegacyDatabase(
  dataDir: string,
  legacyPath: string,
  canonicalPath: string,
  log: (message: string) => void,
): string {
  renameSync(legacyPath, canonicalPath);
  for (const suffix of ["-wal", "-shm"]) {
    const legacySidecar = `${legacyPath}${suffix}`;
    if (existsSync(legacySidecar)) {
      renameSync(legacySidecar, `${canonicalPath}${suffix}`);
    }
  }

  log(
    `Migrated legacy database ${LEGACY_DB_BASENAME} → ${CANONICAL_DB_BASENAME} in ${dataDir}. ` +
      "Set DATABASE_PATH explicitly to override.",
  );
  return canonicalPath;
}

/** Migrate legacy `studio.db` → `murrmure.db` on first launch after rename. */
export function resolveDatabasePath(
  dataDir: string,
  log: (message: string) => void = console.warn,
): string {
  const canonicalPath = join(dataDir, CANONICAL_DB_BASENAME);
  const legacyPath = join(dataDir, LEGACY_DB_BASENAME);

  if (existsSync(canonicalPath)) {
    if (existsSync(legacyPath) && shouldPreferLegacyDatabaseMigration(canonicalPath, legacyPath)) {
      log(
        `Replacing empty ${CANONICAL_DB_BASENAME} with legacy ${LEGACY_DB_BASENAME} in ${dataDir}.`,
      );
      removeDatabaseFiles(canonicalPath);
    } else {
      return canonicalPath;
    }
  }

  if (!existsSync(legacyPath)) {
    return canonicalPath;
  }

  return migrateLegacyDatabase(dataDir, legacyPath, canonicalPath, log);
}

export function buildHubSpawnEnv(paths: DesktopPaths, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const spawnEnv: NodeJS.ProcessEnv = {
    ...env,
    PORT: String(paths.port),
    DATABASE_PATH: resolveDatabasePath(paths.dataDir),
    MURRMURE_LISTEN_HOST: DESKTOP_HOST,
    MURRMURE_DATA_DIR: paths.dataDir,
    MURRMURE_BUNDLE_ROOT: paths.bundleRoot,
  };

  if (paths.mode === "dev-hmr") {
    delete spawnEnv.MURRMURE_SHELL_STATIC_DIR;
  } else if (paths.shellStaticDir) {
    spawnEnv.MURRMURE_SHELL_STATIC_DIR = paths.shellStaticDir;
  }

  if (paths.mcpBridgeEntry) {
    spawnEnv.MURRMURE_MCP_BRIDGE_ENTRY = paths.mcpBridgeEntry;
  }

  return spawnEnv;
}

export function isDesktopDevHmrMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MURRMURE_DESKTOP_DEV_HMR === "1";
}

export function isDesktopDevMode(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): boolean {
  return argv.includes("--dev") || env.MURRMURE_DESKTOP_DEV === "1";
}
