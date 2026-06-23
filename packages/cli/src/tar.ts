import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function assertTool(name: string): void {
  const result = spawnSync("which", [name], { stdio: "ignore" });
  if (result.status !== 0) {
    throw new Error(`${name} is required for flow build artifacts`);
  }
}

/** Create a zstd-compressed tar archive from paths relative to cwd. */
export function createTarZst(cwd: string, outputPath: string, paths: string[]): void {
  assertTool("tar");
  assertTool("zstd");

  const tar = spawnSync("tar", ["-cf", "-", ...paths], {
    cwd,
    env: { ...process.env, COPYFILE_DISABLE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (tar.error) {
    throw tar.error;
  }
  if (tar.status !== 0) {
    throw new Error(`tar failed: ${tar.stderr?.toString() ?? tar.status}`);
  }

  const zstd = spawnSync("zstd", ["-q", "-o", outputPath, "-"], {
    input: tar.stdout,
    stdio: ["pipe", "inherit", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (zstd.error) {
    throw zstd.error;
  }
  if (zstd.status !== 0) {
    throw new Error(`zstd failed: ${zstd.stderr?.toString() ?? zstd.status}`);
  }
}

export function assertPathsExist(baseDir: string, paths: string[]): void {
  for (const rel of paths) {
    const full = join(baseDir, rel);
    if (!existsSync(full)) {
      throw new Error(`Missing build path: ${rel}`);
    }
  }
}
