import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_PACKAGE_NAME = "@murrmure/cli";

export function cliPackageRoot(startUrl: string = import.meta.url): string {
  let dir = dirname(fileURLToPath(startUrl));
  for (let depth = 0; depth < 8; depth += 1) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
        if (pkg.name === CLI_PACKAGE_NAME) {
          return dir;
        }
      } catch {
        /* walk up */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(`Could not locate ${CLI_PACKAGE_NAME} package root`);
}

export function cliResourcePath(...segments: string[]): string {
  const path = join(cliPackageRoot(), ...segments);
  if (!existsSync(path)) {
    throw new Error(`CLI resource not found: ${path}`);
  }
  return path;
}
