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
import { DEFAULT_BOOTSTRAP_TOKEN_BARE, ensureBootstrapSession, toBearerToken, type BootstrapSession } from "./session.js";

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
  // Do not fetch from the Electrobun process — Bun fetch to 127.0.0.1 hangs there.
  const session = resolveDevHmrBootstrapSession(env);

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

export function resolveDevHmrBootstrapSession(env: NodeJS.ProcessEnv = process.env): BootstrapSession {
  const token = toBearerToken(env.MURRMURE_BOOTSTRAP_TOKEN ?? DEFAULT_BOOTSTRAP_TOKEN_BARE);
  const actorId = env.MURRMURE_BOOTSTRAP_ACTOR_ID?.trim();
  if (!actorId) {
    throw new Error(
      "Missing MURRMURE_BOOTSTRAP_ACTOR_ID — run via `pnpm desktop:dev:hmr` (orchestrator pre-fetches whoami).",
    );
  }
  return { token, actor_id: actorId };
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
