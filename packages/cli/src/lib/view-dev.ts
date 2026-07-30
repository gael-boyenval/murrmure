import { spawn, type ChildProcessByStdio } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { resolveViewDir } from "./view-scaffold.js";

export type PackageManager = "npm" | "pnpm" | "bun";

export interface ViewDevFixture {
  name: string;
  path: string;
}

export interface ViewDevSession {
  view_id: string;
  view_dir: string;
  dev_url?: string;
  fixtures: ViewDevFixture[];
  initial_fixture?: string;
  started_at: string;
}

export function detectPackageManager(viewDir: string): PackageManager {
  if (existsSync(join(viewDir, "bun.lockb")) || existsSync(join(viewDir, "bun.lock"))) {
    return "bun";
  }
  if (existsSync(join(viewDir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  return "npm";
}

export function packageManagerRunArgs(pm: PackageManager, script: string): [string, string[]] {
  switch (pm) {
    case "pnpm":
      return ["pnpm", ["run", script]];
    case "bun":
      return ["bun", ["run", script]];
    default:
      return ["npm", ["run", script]];
  }
}

/** Dedicated port so view Vite never collides with Desktop shell (5174) or docs (5173). */
export const VIEW_DEV_DEFAULT_PORT = 5199;

/** Extra args forwarded to the view package's `dev` script (Vite). */
export function viewDevScriptExtraArgs(port = VIEW_DEV_DEFAULT_PORT): string[] {
  return ["--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
}

export function packageManagerViewDevArgs(
  pm: PackageManager,
  port = VIEW_DEV_DEFAULT_PORT,
): [string, string[]] {
  const [cmd, baseArgs] = packageManagerRunArgs(pm, "dev");
  return [cmd, [...baseArgs, ...viewDevScriptExtraArgs(port)]];
}

export function readViewPackageJson(viewDir: string): { scripts?: Record<string, string> } {
  const pkgPath = join(viewDir, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`Missing package.json in ${viewDir}`);
  }
  return JSON.parse(readFileSync(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
}

export function listViewFixtures(viewDir: string): ViewDevFixture[] {
  const fixturesDir = join(viewDir, "dev", "fixtures");
  if (!existsSync(fixturesDir)) {
    throw new Error(`Missing dev/fixtures/ in ${viewDir} — run mrmr space view init`);
  }
  const files = readdirSync(fixturesDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    throw new Error(`No fixture files in ${fixturesDir}`);
  }
  return files.map((name) => ({
    name: name.replace(/\.json$/, ""),
    path: join(fixturesDir, name),
  }));
}

export function validateViewDevPackage(viewDir: string): void {
  const pkg = readViewPackageJson(viewDir);
  if (!pkg.scripts?.dev) {
    throw new Error(`package.json must define scripts.dev — required for mrmr view dev`);
  }
  listViewFixtures(viewDir);
}

/** Fail early when Vite is missing (common after skipping npm install). */
export function assertViewDevDependencies(viewDir: string): void {
  const binDir = join(viewDir, "node_modules", ".bin");
  const viteUnix = join(binDir, "vite");
  const viteWin = join(binDir, "vite.cmd");
  if (!existsSync(viteUnix) && !existsSync(viteWin)) {
    throw new Error(
      `Vite not found in ${viewDir}/node_modules — run: npm install --prefix ${viewDir}`,
    );
  }
}

export function parseViteDevUrl(line: string): string | undefined {
  const match =
    line.match(/Local:\s+(https?:\/\/[^\s]+)/) ??
    line.match(/➜\s+Local:\s+(https?:\/\/[^\s]+)/);
  return match?.[1]?.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Reject URLs that are clearly the Desktop shell / docs, not a view package. */
export async function assertViewDevServerUrl(
  url: string,
  viewId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let html: string;
  try {
    const res = await fetch(url, { redirect: "follow" });
    html = await res.text();
  } catch (error) {
    return {
      ok: false,
      message: `View dev URL ${url} is not reachable — ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const looksLikeShell =
    /Create your first space/i.test(html) ||
    (/Murrmure/i.test(html) && /Observer/i.test(html)) ||
    /No spaces linked yet/i.test(html);
  if (looksLikeShell) {
    return {
      ok: false,
      message:
        `View dev URL ${url} is serving Murrmure Desktop/shell, not view '${viewId}'. ` +
        `Stop other Vite servers on that port and re-run \`mrmr view dev ${viewId}\` ` +
        `(views use port ${VIEW_DEV_DEFAULT_PORT}).`,
    };
  }

  const looksLikeView =
    html.includes('id="root"') || html.includes("/src/main") || html.includes(viewId);
  if (!looksLikeView) {
    return {
      ok: false,
      message:
        `View dev URL ${url} does not look like a view package (missing #root / main entry). ` +
        `Re-run \`mrmr view dev ${viewId}\` from the linked space root.`,
    };
  }

  return { ok: true };
}

export function writeViewDevSession(spaceRoot: string, session: ViewDevSession): string {
  const dir = join(spaceRoot, ".mrmr", "dev");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "view-dev.json");
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, "utf-8");
  return path;
}

/** Remove session file so Desktop Space Home drops the view-dev affordance. */
export function clearViewDevSession(spaceRoot: string): void {
  const path = join(spaceRoot, ".mrmr", "dev", "view-dev.json");
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export function resolveInitialFixture(
  fixtures: ViewDevFixture[],
  requested?: string,
): ViewDevFixture {
  if (!requested) return fixtures[0]!;
  const match = fixtures.find((f) => f.name === requested);
  if (!match) {
    throw new Error(
      `Fixture '${requested}' not found — available: ${fixtures.map((f) => f.name).join(", ")}`,
    );
  }
  return match;
}

export interface ViewDevProcessHandle {
  child: ChildProcessByStdio<null, Readable, Readable>;
  devUrl: Promise<string>;
  stop: () => void;
}

export function startViewDevProcess(viewDir: string): ViewDevProcessHandle {
  validateViewDevPackage(viewDir);
  assertViewDevDependencies(viewDir);
  const pm = detectPackageManager(viewDir);
  const [cmd, args] = packageManagerViewDevArgs(pm);

  let resolveUrl: (url: string) => void;
  let rejectUrl: (error: Error) => void;
  const devUrl = new Promise<string>((resolve, reject) => {
    resolveUrl = resolve;
    rejectUrl = reject;
  });

  const child = spawn(cmd, args, {
    cwd: viewDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let settled = false;
  const tryResolve = (chunk: string) => {
    if (settled) return;
    const url = parseViteDevUrl(chunk);
    if (!url) return;
    settled = true;
    void (async () => {
      const viewId = viewDir.split(/[/\\]/).filter(Boolean).pop() ?? "view";
      const check = await assertViewDevServerUrl(url, viewId);
      if (!check.ok) {
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        rejectUrl!(new Error(check.message));
        return;
      }
      resolveUrl!(url);
    })();
  };

  child.stdout.on("data", (buf: Buffer) => {
    const text = buf.toString();
    process.stdout.write(text);
    tryResolve(text);
  });

  child.stderr.on("data", (buf: Buffer) => {
    const text = buf.toString();
    process.stderr.write(text);
    tryResolve(text);
  });

  child.on("error", (error) => {
    if (!settled) {
      settled = true;
      rejectUrl!(error);
    }
  });

  child.on("exit", (code) => {
    if (!settled) {
      settled = true;
      rejectUrl!(new Error(`Dev server exited before URL was ready (code ${code ?? "unknown"})`));
    }
  });

  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true;
      rejectUrl!(new Error("Timed out waiting for Vite dev server URL"));
    }
  }, 60_000);

  devUrl.finally(() => clearTimeout(timeout));

  return {
    child,
    devUrl,
    stop: () => {
      child.kill("SIGTERM");
    },
  };
}

export function resolveViewDevPaths(
  murrmureRoot: string,
  viewId: string,
): { viewDir: string; spaceRoot: string } {
  const viewDir = resolveViewDir(murrmureRoot, viewId);
  if (!existsSync(viewDir)) {
    throw new Error(`View '${viewId}' not found at ${viewDir}`);
  }
  const spaceRoot = join(murrmureRoot, "..");
  return { viewDir, spaceRoot };
}
