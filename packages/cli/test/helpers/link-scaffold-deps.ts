import { mkdirSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));

/** Wire monorepo workspace packages into a scaffold dir for integration tests. */
export function linkScaffoldWorkspaceDeps(flowDir: string): void {
  const nodeModules = join(flowDir, "node_modules");
  mkdirSync(join(nodeModules, "@murrmure"), { recursive: true });

  const linkDir = (target: string, linkPath: string) => {
    mkdirSync(join(linkPath, ".."), { recursive: true });
    symlinkSync(target, linkPath, "dir");
  };

  linkDir(join(REPO_ROOT, "packages/flow-dev-kit"), join(nodeModules, "@murrmure/flow-dev-kit"));
  linkDir(join(REPO_ROOT, "packages/flow-dev-kit/node_modules/react"), join(nodeModules, "react"));
  linkDir(
    join(REPO_ROOT, "packages/flow-dev-kit/node_modules/react-dom"),
    join(nodeModules, "react-dom"),
  );
}
