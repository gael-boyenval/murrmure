import { execSync, spawnSync } from "node:child_process";

const DEV_DESKTOP_ORPHAN_PATTERNS = [
  "Murrmure-dev.app/Contents/MacOS/launcher",
  "Murrmure-dev.app/Contents/Resources/main.js",
] as const;

function listChildPids(pid: number): number[] {
  try {
    const output = execSync(`pgrep -P ${pid}`, { encoding: "utf8" }).trim();
    if (!output) {
      return [];
    }
    return output
      .split("\n")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
  } catch {
    return [];
  }
}

export function killProcessTree(pid: number | undefined, signal: NodeJS.Signals = "SIGTERM"): void {
  if (!pid || pid <= 0) {
    return;
  }
  for (const childPid of listChildPids(pid)) {
    killProcessTree(childPid, signal);
  }
  try {
    process.kill(pid, signal);
  } catch {
    // Process already exited.
  }
}

export function killDevDesktopOrphans(): void {
  for (const pattern of DEV_DESKTOP_ORPHAN_PATTERNS) {
    spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });
  }
}
