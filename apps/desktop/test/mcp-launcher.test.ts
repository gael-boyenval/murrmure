import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildMcpLauncherScript,
  installMcpLauncher,
} from "../src/mcp-launcher.js";

describe("stable bundled MCP launcher", () => {
  test("installs atomically with user-only executable permissions", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "murrmure-launcher-"));
    try {
      const result = installMcpLauncher({
        dataDir,
        bridgeEntry: "/Applications/Murrmure.app/Contents/Resources/mcp-bridge/main.js",
        nodeBinary: "/Applications/Murrmure.app/Contents/MacOS/node",
        platform: "darwin",
      });
      expect(result.supported).toBe(true);
      expect(result.command).toBe(join(dataDir, "bin", "murrmure-mcp"));
      expect(statSync(result.command).mode & 0o777).toBe(0o700);
      const script = readFileSync(result.command, "utf8");
      expect(script).toContain("mcp_bridge.entry");
      expect(script).toContain("failed validation");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("quotes paths with spaces and rejects unsupported packaged platforms", () => {
    const script = buildMcpLauncherScript({
      discoveryPath: "/Users/Test User/.murrmure/hubs/shared.json",
      bridgeEntry: "/Applications/Murrmure Preview.app/Contents/Resources/mcp-bridge/main.js",
      nodeBinary: "/Applications/Murrmure Preview.app/Contents/MacOS/node",
    });
    expect(script).toContain("Murrmure Preview.app");
    expect(
      installMcpLauncher({
        dataDir: "/tmp/murrmure",
        bridgeEntry: "/tmp/main.js",
        nodeBinary: "/usr/bin/node",
        platform: "linux",
      }).supported,
    ).toBe(false);
  });
});
