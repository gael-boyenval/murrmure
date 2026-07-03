import { accessSync, constants } from "node:fs";
import type { Subprocess } from "bun";
import {
  detectExistingHub,
  stopHubChild,
  waitForHubHealth,
} from "./lifecycle.js";
import {
  buildHubSpawnEnv,
  isDesktopDevMode,
  resolveDesktopPaths,
  type DesktopPaths,
} from "./paths.js";
import { ensureBootstrapSession } from "./session.js";

export type HubProcess = Subprocess;

export interface HubSidecarHandle {
  paths: DesktopPaths;
  token: string;
  actorId: string;
  hubProcess: HubProcess;
  shutdown: () => Promise<void>;
}

function assertReadablePath(path: string, label: string): void {
  try {
    accessSync(path, constants.R_OK);
  } catch {
    throw new Error(`${label} is not readable: ${path}`);
  }
}

export async function withSidecarStartupCleanup<T>(
  hubProcess: HubProcess,
  startup: () => Promise<T>,
): Promise<T> {
  try {
    return await startup();
  } catch (error) {
    await stopHubChild(hubProcess);
    throw error;
  }
}

export async function startHubSidecar(options?: {
  mode?: "dev" | "prod" | "dev-hmr";
}): Promise<HubSidecarHandle> {
  const mode = options?.mode ?? (isDesktopDevMode() ? "dev" : "prod");
  const paths = resolveDesktopPaths({ mode });

  const existingHub = await detectExistingHub(paths.lockOwnerPath);
  if (existingHub.running) {
    const endpoint = existingHub.endpoint ?? paths.hubUrl;
    throw new Error(`Murrmure hub is already running at ${endpoint}.`);
  }

  if (mode === "dev") {
    if (paths.hubCommand !== "pnpm") {
      assertReadablePath(paths.hubEntry, "Hub entry");
    }
    assertReadablePath(paths.shellStaticDir, "Bundled shell dist");
    assertReadablePath(paths.bundleRoot, "Bundle root");
  }

  if (mode === "dev-hmr") {
    assertReadablePath(paths.bundleRoot, "Bundle root");
  }

  const hubProcess = Bun.spawn([paths.hubCommand, ...paths.hubArgs], {
    env: buildHubSpawnEnv(paths),
    stdout: "inherit",
    stderr: "inherit",
  });

  return withSidecarStartupCleanup(hubProcess, async () => {
    await waitForHubHealth(paths.healthUrl);
    const session = await ensureBootstrapSession({
      hubUrl: paths.hubUrl,
      bootstrapToken: process.env.MURRMURE_BOOTSTRAP_TOKEN,
    });

    let closed = false;
    const shutdown = async (): Promise<void> => {
      if (closed) {
        return;
      }
      closed = true;
      await stopHubChild(hubProcess);
    };

    return { paths, token: session.token, actorId: session.actor_id, hubProcess, shutdown };
  });
}

export async function connectDevHmrServices(): Promise<HubSidecarHandle> {
  const env = process.env;
  const paths = resolveDesktopPaths({ mode: "dev-hmr", env });

  // run-dev-hmr.ts already waits for hub + Vite before spawning the native window.
  // Re-fetching from the Electrobun Worker is flaky (Bun Worker fetch to localhost)
  // and blocks window creation for up to 30s when it fails.
  const session = await ensureBootstrapSession({
    hubUrl: paths.hubUrl,
    bootstrapToken: process.env.MURRMURE_BOOTSTRAP_TOKEN,
  });

  const hubProcess = {
    exited: Promise.resolve(),
    kill: () => undefined,
  } as unknown as HubProcess;

  return {
    paths,
    token: session.token,
    actorId: session.actor_id,
    hubProcess,
    shutdown: async () => undefined,
  };
}

export function bootstrapLaunchUrl(hubUrl: string, token: string): string {
  const base = hubUrl.replace(/\/$/, "");
  return `${base}/#murrmure-bootstrap=${encodeURIComponent(token)}`;
}

export async function openInSystemBrowser(url: string): Promise<void> {
  if (process.platform === "darwin") {
    Bun.spawn(["open", url]);
    return;
  }
  if (process.platform === "win32") {
    Bun.spawn(["cmd", "/c", "start", "", url]);
    return;
  }
  Bun.spawn(["xdg-open", url]);
}
