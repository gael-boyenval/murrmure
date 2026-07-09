import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const DEV_LINK_MARKER = ".dev/cli-global-link.json";

interface DevLinkEntry {
  path: string;
  previousTarget?: string;
  replacedFile: boolean;
}

interface DevLinkState {
  bin_dir: string;
  bins: DevLinkEntry[];
}

export function cliPackageDir(repoRoot: string): string {
  return join(repoRoot, "packages/cli");
}

export function mcpBridgePackageDir(repoRoot: string): string {
  return join(repoRoot, "packages/mcp-bridge");
}

export function devLinkMarkerPath(repoRoot: string): string {
  return join(repoRoot, DEV_LINK_MARKER);
}

/** Fallback global bin when `mrmr` is not already on PATH. */
export function resolveGlobalBinDir(): string {
  if (process.env.PNPM_HOME?.trim()) {
    return process.env.PNPM_HOME.trim();
  }

  const pnpmBin = spawnSync("pnpm", ["bin", "-g"], { encoding: "utf8" });
  if (pnpmBin.status === 0 && pnpmBin.stdout.trim()) {
    return pnpmBin.stdout.trim();
  }

  const npmPrefix = spawnSync("npm", ["prefix", "-g"], { encoding: "utf8" });
  if (npmPrefix.status === 0 && npmPrefix.stdout.trim()) {
    return join(npmPrefix.stdout.trim(), "bin");
  }

  throw new Error("Could not resolve global bin directory (PNPM_HOME / pnpm bin -g / npm prefix -g)");
}

/** Prefer the bin dir already used by an installed `mrmr`, else global fallback. */
export function resolveDevBinDir(): string {
  const which = spawnSync("sh", ["-c", "command -v mrmr 2>/dev/null || true"], {
    encoding: "utf8",
  });
  const existing = which.stdout.trim();
  if (existing) {
    return dirname(existing);
  }
  return resolveGlobalBinDir();
}

function buildPackage(repoRoot: string, packageName: string): void {
  const result = spawnSync("pnpm", ["--filter", packageName, "build"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Build failed for ${packageName}`);
  }
}

export function buildCli(repoRoot: string): void {
  buildPackage(repoRoot, "@murrmure/cli");
  buildPackage(repoRoot, "@murrmure/mcp-bridge");
}

function readDevLinkState(repoRoot: string): DevLinkState | null {
  const markerPath = devLinkMarkerPath(repoRoot);
  if (!existsSync(markerPath)) {
    return null;
  }
  return JSON.parse(readFileSync(markerPath, "utf-8")) as DevLinkState;
}

function writeDevLinkState(repoRoot: string, state: DevLinkState): void {
  const markerPath = devLinkMarkerPath(repoRoot);
  mkdirSync(join(repoRoot, ".dev"), { recursive: true });
  writeFileSync(markerPath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

/** Symlink built `mrmr` / `murrmure` / `murrmure-mcp` into global bin for local dev testing. */
export function linkCliGlobal(repoRoot: string): void {
  if (readDevLinkState(repoRoot)) {
    throw new Error("CLI dev global links already active — stop the other dev session first");
  }

  buildCli(repoRoot);
  const binDir = resolveDevBinDir();
  const binaries = [
    {
      name: "mrmr",
      target: join(cliPackageDir(repoRoot), "dist", "cli.js"),
    },
    {
      name: "murrmure",
      target: join(cliPackageDir(repoRoot), "dist", "cli.js"),
    },
    {
      name: "murrmure-mcp",
      target: join(mcpBridgePackageDir(repoRoot), "dist", "main.js"),
    },
  ] as const;
  const state: DevLinkState = { bin_dir: binDir, bins: [] };

  for (const { name, target } of binaries) {
    const binPath = join(binDir, name);
    if (!existsSync(target)) {
      throw new Error(`Build output missing: ${target}`);
    }

    const entry: DevLinkEntry = { path: binPath, replacedFile: false };
    if (existsSync(binPath)) {
      try {
        entry.previousTarget = readlinkSync(binPath);
        unlinkSync(binPath);
      } catch {
        entry.replacedFile = true;
        throw new Error(
          `Refusing to overwrite global ${name} (${binPath}) — remove the existing binary first`,
        );
      }
    }

    symlinkSync(target, binPath);
    state.bins.push(entry);
  }

  writeDevLinkState(repoRoot, state);
  console.log(`[desktop:dev:hmr] linked mrmr, murrmure, murrmure-mcp (${binDir})`);
}

/** Remove dev global symlinks created by linkCliGlobal. */
export function unlinkCliGlobal(repoRoot: string): void {
  const state = readDevLinkState(repoRoot);
  if (!state) {
    return;
  }

  for (const entry of state.bins) {
    if (!existsSync(entry.path)) {
      continue;
    }
    try {
      unlinkSync(entry.path);
    } catch {
      // Already removed.
    }
    if (entry.previousTarget) {
      try {
        symlinkSync(entry.previousTarget, entry.path);
      } catch {
        // Best-effort restore of prior global install.
      }
    }
  }

  try {
    unlinkSync(devLinkMarkerPath(repoRoot));
  } catch {
    // Marker already gone.
  }
}
