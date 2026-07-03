import { execSync } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));

function linkDir(target: string, linkPath: string): void {
  mkdirSync(join(linkPath, ".."), { recursive: true });
  symlinkSync(target, linkPath, "dir");
}

/** Wire monorepo workspace packages into a scaffolded view for build smoke tests. */
export function linkViewScaffoldWorkspaceDeps(viewDir: string): void {
  const nodeModules = join(viewDir, "node_modules");
  mkdirSync(join(nodeModules, "@murrmure"), { recursive: true });

  linkDir(join(REPO_ROOT, "packages/view-sdk"), join(nodeModules, "@murrmure/view-sdk"));
  linkDir(join(REPO_ROOT, "packages/view-sdk/node_modules/react"), join(nodeModules, "react"));
  linkDir(
    join(REPO_ROOT, "packages/view-sdk/node_modules/react-dom"),
    join(nodeModules, "react-dom"),
  );
}

/** Minimal dist for apply --strict when full npm build is skipped. */
export function writeMinimalViewDist(viewDir: string): void {
  const distDir = join(viewDir, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<!doctype html><html><body></body></html>", "utf-8");
}

/** Run npm install + build in a scaffolded view directory. */
export function buildScaffoldedView(viewDir: string): void {
  linkViewScaffoldWorkspaceDeps(viewDir);
  execSync("npm install --no-fund --no-audit", {
    cwd: viewDir,
    stdio: "pipe",
    env: { ...process.env, npm_config_loglevel: "error" },
  });
  execSync("npm run build", { cwd: viewDir, stdio: "pipe" });
  if (!existsSync(join(viewDir, "dist", "index.html"))) {
    throw new Error(`Expected dist/index.html after build in ${viewDir}`);
  }
}
