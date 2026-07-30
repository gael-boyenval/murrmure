import { installMcpLauncher } from "../src/mcp-launcher.js";
import { buildHubSpawnEnv, resolveDesktopPaths } from "../src/paths.js";

const paths = resolveDesktopPaths({ mode: "dev-hmr" });

// Advertise + install the stable launcher before (or while attaching to) the hub
// so shared.json's mcp_bridge.command path exists for local tool connections.
const launcher = installMcpLauncher({
  dataDir: paths.dataDir,
  bridgeEntry: paths.mcpBridgeEntry,
  nodeBinary: paths.nodeBinary,
});
if (launcher.supported) {
  console.log(`[desktop:dev:hmr:hub] MCP launcher ready at ${launcher.command}`);
} else {
  console.warn(
    "[desktop:dev:hmr:hub] MCP launcher not installed (missing bridge entry or unsupported platform)",
  );
}

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
