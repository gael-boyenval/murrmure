import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const DESKTOP_PORT = 8787;
export const DESKTOP_HOST = "127.0.0.1";

export interface DesktopPaths {
  mode: "dev" | "prod";
  repoRoot: string | null;
  dataDir: string;
  logsDir: string;
  lockOwnerPath: string;
  hubCommand: string;
  hubArgs: string[];
  nodeBinary: string;
  hubEntry: string;
  shellStaticDir: string;
  bundleRoot: string;
  hubUrl: string;
  healthUrl: string;
  port: number;
}

export interface ResolveDesktopPathsOptions {
  mode: "dev" | "prod";
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(moduleDir, "../../..");

function inferRepoRootFromCwd(cwd: string): string | null {
  const marker = `${sep}apps${sep}desktop`;
  const markerIndex = cwd.lastIndexOf(marker);
  if (markerIndex === -1) {
    return null;
  }
  return cwd.slice(0, markerIndex);
}

function parsePort(rawPort: string | undefined): number {
  const parsed = Number(rawPort);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DESKTOP_PORT;
  }
  return parsed;
}

export function resolveDesktopPaths(options: ResolveDesktopPathsOptions): DesktopPaths {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const mode = options.mode;
  const port = parsePort(env.PORT);
  const dataDir = env.MURRMURE_DATA_DIR ?? join(homedir(), ".murrmure");
  const logsDir = join(dataDir, "logs");
  const lockOwnerPath = join(dataDir, "hub.lock", "owner.json");
  const hubUrl = `http://${DESKTOP_HOST}:${port}`;
  const healthUrl = `${hubUrl}/v1/health`;

  if (mode === "dev") {
    const repoRoot = env.MURRMURE_REPO_ROOT
      ? resolve(env.MURRMURE_REPO_ROOT)
      : (inferRepoRootFromCwd(cwd) ?? defaultRepoRoot);
    const nodeBinary = env.MURRMURE_DESKTOP_NODE ?? "node";
    const distHubEntry = join(repoRoot, "packages/studio-hub-daemon/dist/main.js");
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
      bundleRoot: env.MURRMURE_BUNDLE_ROOT ?? join(repoRoot, "fixtures"),
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
    bundleRoot: env.MURRMURE_BUNDLE_ROOT ?? resourcesDir,
    hubUrl,
    healthUrl,
    port,
  };
}

export function buildHubSpawnEnv(paths: DesktopPaths, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    PORT: String(paths.port),
    DATABASE_PATH: join(paths.dataDir, "studio.db"),
    MURRMURE_LISTEN_HOST: DESKTOP_HOST,
    MURRMURE_DATA_DIR: paths.dataDir,
    MURRMURE_SHELL_STATIC_DIR: paths.shellStaticDir,
    MURRMURE_BUNDLE_ROOT: paths.bundleRoot,
  };
}

export function isDesktopDevMode(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): boolean {
  return argv.includes("--dev") || env.MURRMURE_DESKTOP_DEV === "1";
}
