import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const VIEW_SDK_DIR = join(REPO_ROOT, "packages/view-sdk");

function linkDir(target: string, linkPath: string): void {
  mkdirSync(join(linkPath, ".."), { recursive: true });
  symlinkSync(target, linkPath, "dir");
}

/** Wire monorepo workspace packages into a scaffolded view for build smoke tests. */
export function linkViewScaffoldWorkspaceDeps(viewDir: string): void {
  const nodeModules = join(viewDir, "node_modules");
  mkdirSync(join(nodeModules, "@murrmure"), { recursive: true });

  linkDir(VIEW_SDK_DIR, join(nodeModules, "@murrmure/view-sdk"));
  linkDir(join(REPO_ROOT, "packages/view-sdk/node_modules/react"), join(nodeModules, "react"));
  linkDir(
    join(REPO_ROOT, "packages/view-sdk/node_modules/react-dom"),
    join(nodeModules, "react-dom"),
  );
}

/** Point private @murrmure deps at the workspace so npm never hits the registry. */
function pinWorkspaceViewSdk(viewDir: string): void {
  const pkgPath = join(viewDir, "package.json");
  if (!existsSync(pkgPath)) return;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
    dependencies?: Record<string, string>;
  };
  if (!pkg.dependencies?.["@murrmure/view-sdk"]) return;
  pkg.dependencies["@murrmure/view-sdk"] = `file:${VIEW_SDK_DIR}`;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
}

/** Minimal dist for apply --strict when full npm build is skipped. */
export function writeMinimalViewDist(viewDir: string): void {
  const distDir = join(viewDir, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<!doctype html><html><body></body></html>", "utf-8");
}

/** Run npm install + build in a scaffolded view directory. */
export function buildScaffoldedView(viewDir: string): void {
  pinWorkspaceViewSdk(viewDir);
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
