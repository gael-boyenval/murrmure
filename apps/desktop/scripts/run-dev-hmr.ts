import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureBootstrapSession } from "../src/session.js";
import { linkCliGlobal, unlinkCliGlobal } from "./dev-hmr-cli.js";
import { killDevDesktopOrphans, killProcessTree } from "./dev-hmr-process.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const hubPort = process.env.PORT ?? process.env.HUB_PORT ?? "8787";
const hubHealthUrl = `http://127.0.0.1:${hubPort}/v1/health`;
const shellDevUrl = `http://127.0.0.1:${process.env.VITE_PORT ?? process.env.SHELL_DEV_PORT ?? "5174"}/`;

function start(command: string, args: string[], env?: NodeJS.ProcessEnv): ChildProcess {
  return spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
}

async function waitForOk(url: string, label: string, timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  let lastError = "unknown";
  while (Date.now() - started <= timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) {
        if (label === "shell") {
          const body = await res.text();
          if (!body.includes('id="root"') || !body.includes("/src/main.tsx")) {
            lastError = "missing Vite shell markers";
          } else {
            return;
          }
        } else {
          return;
        }
      } else {
        lastError = `HTTP ${res.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await Bun.sleep(250);
  }
  throw new Error(`${label} not ready at ${url} (${lastError})`);
}

const children: ChildProcess[] = [];
let cliLinked = false;
let shuttingDown = false;

async function shutdown(exitCode = 0): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  console.log("[desktop:dev:hmr] shutting down…");

  for (const child of [...children].reverse()) {
    killProcessTree(child.pid, "SIGTERM");
  }
  await Bun.sleep(750);
  for (const child of children) {
    killProcessTree(child.pid, "SIGKILL");
  }

  killDevDesktopOrphans();

  if (cliLinked) {
    unlinkCliGlobal(repoRoot);
    cliLinked = false;
  }

  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void shutdown(130);
});
process.on("SIGTERM", () => {
  void shutdown(143);
});

try {
  console.log("[desktop:dev:hmr] building + linking CLI + bridge globally (mrmr / murrmure / murrmure-mcp)…");
  linkCliGlobal(repoRoot);
  cliLinked = true;

  console.log("[desktop:dev:hmr] starting hub…");
  children.push(start("bun", ["run", "apps/desktop/scripts/run-hmr-hub.ts"], { PORT: hubPort }));
  await waitForOk(hubHealthUrl, "hub");

  console.log("[desktop:dev:hmr] starting shell (Vite HMR)…");
  children.push(start("pnpm", ["--filter", "@murrmure/shell-web", "dev:bundled"]));
  await waitForOk(shellDevUrl, "shell");

  console.log("[desktop:dev:hmr] starting native window…");
  const hubUrl = `http://127.0.0.1:${hubPort}`;
  const session = await ensureBootstrapSession({ hubUrl });
  const window = start("pnpm", ["--filter", "@murrmure/desktop", "dev:hmr"], {
    MURRMURE_REPO_ROOT: repoRoot,
    MURRMURE_BOOTSTRAP_TOKEN: session.token,
    MURRMURE_BOOTSTRAP_ACTOR_ID: session.actor_id,
  });
  children.push(window);

  for (const child of children) {
    child.on("exit", (code, signal) => {
      if (shuttingDown) {
        return;
      }
      const exitCode = code ?? (signal === "SIGTERM" ? 143 : 1);
      void shutdown(exitCode);
    });
  }
} catch (error) {
  console.error("[desktop:dev:hmr] failed:", error instanceof Error ? error.message : error);
  await shutdown(1);
}
