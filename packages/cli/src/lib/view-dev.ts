import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

export function parseViteDevUrl(line: string): string | undefined {
  const match =
    line.match(/Local:\s+(https?:\/\/[^\s]+)/) ??
    line.match(/➜\s+Local:\s+(https?:\/\/[^\s]+)/);
  return match?.[1]?.replace(/\x1b\[[0-9;]*m/g, "");
}

export function writeViewDevSession(spaceRoot: string, session: ViewDevSession): string {
  const dir = join(spaceRoot, ".murrmure");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "view-dev.json");
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, "utf-8");
  return path;
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
  child: ChildProcessWithoutNullStreams;
  devUrl: Promise<string>;
  stop: () => void;
}

export function startViewDevProcess(viewDir: string): ViewDevProcessHandle {
  validateViewDevPackage(viewDir);
  const pm = detectPackageManager(viewDir);
  const [cmd, args] = packageManagerRunArgs(pm, "dev");

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
    if (url) {
      settled = true;
      resolveUrl!(url);
    }
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
