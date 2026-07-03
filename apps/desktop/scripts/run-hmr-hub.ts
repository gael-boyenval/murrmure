import { buildHubSpawnEnv, resolveDesktopPaths } from "../src/paths.js";

const paths = resolveDesktopPaths({ mode: "dev-hmr" });

async function hubAlreadyHealthy(): Promise<boolean> {
  try {
    const res = await fetch(paths.healthUrl, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

if (await hubAlreadyHealthy()) {
  console.log(`[desktop:dev:hmr:hub] Hub already running at ${paths.hubUrl} — attaching (not spawning a second instance).`);
  await new Promise<void>(() => {
    // Keep this process alive until the orchestrator sends SIGTERM.
  });
}

const proc = Bun.spawn([paths.hubCommand, ...paths.hubArgs], {
  env: buildHubSpawnEnv(paths),
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await proc.exited;
process.exit(exitCode ?? 1);
