import { accessSync, constants } from "node:fs";
import type { Subprocess } from "bun";
import { detectExistingHub, stopHubChild, waitForHubHealth } from "./lifecycle.js";
import { buildHubSpawnEnv, isDesktopDevMode, resolveDesktopPaths, type DesktopPaths } from "./paths.js";
import { ensureBootstrapSessionToken } from "./session.js";

export type HubProcess = Subprocess;

export interface HubSidecarHandle {
  paths: DesktopPaths;
  token: string;
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
  mode?: "dev" | "prod";
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

  const hubProcess = Bun.spawn([paths.hubCommand, ...paths.hubArgs], {
    env: buildHubSpawnEnv(paths),
    stdout: "inherit",
    stderr: "inherit",
  });

  return withSidecarStartupCleanup(hubProcess, async () => {
    await waitForHubHealth(paths.healthUrl);
    const token = await ensureBootstrapSessionToken({
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

    return { paths, token, hubProcess, shutdown };
  });
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
