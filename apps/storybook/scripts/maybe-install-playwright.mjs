/**
 * Install Playwright Chromium for local snapshot capture.
 * Skip in CI — visual snapshots are not part of the CI build/test path.
 */
if (process.env.CI === "true" || process.env.CI === "1") {
  process.exit(0);
}

const { spawnSync } = await import("node:child_process");
const result = spawnSync("playwright", ["install", "chromium"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
