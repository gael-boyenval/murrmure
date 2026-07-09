import { existsSync, mkdtempSync, readlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

describe("dev-hmr-cli", () => {
  test("cliPackageDir resolves packages/cli from repo root", async () => {
    const { cliPackageDir } = await import("../scripts/dev-hmr-cli.js");
    expect(cliPackageDir("/repo")).toBe("/repo/packages/cli");
  });

  test("mcpBridgePackageDir resolves packages/mcp-bridge from repo root", async () => {
    const { mcpBridgePackageDir } = await import("../scripts/dev-hmr-cli.js");
    expect(mcpBridgePackageDir("/repo")).toBe("/repo/packages/mcp-bridge");
  });

  test("devLinkMarkerPath is under repo .dev/", async () => {
    const { devLinkMarkerPath } = await import("../scripts/dev-hmr-cli.js");
    expect(devLinkMarkerPath("/repo")).toBe("/repo/.dev/cli-global-link.json");
  });
});

describe("dev-hmr-cli link lifecycle", () => {
  let repoRoot: string;
  let binDir: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "murrmure-dev-link-"));
    binDir = mkdtempSync(join(tmpdir(), "murrmure-dev-bin-"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  });

  test("linkCliGlobal symlinks built CLI into global bin and unlink restores", async () => {
    const cliDist = join(repoRoot, "packages/cli/dist");
    const bridgeDist = join(repoRoot, "packages/mcp-bridge/dist");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(cliDist, { recursive: true });
    mkdirSync(bridgeDist, { recursive: true });
    writeFileSync(join(cliDist, "cli.js"), "#!/usr/bin/env node\n");
    writeFileSync(join(bridgeDist, "main.js"), "#!/usr/bin/env node\n");

    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...actual,
        spawnSync: vi.fn((cmd: string, args: string[]) => {
          if (cmd === "pnpm" && args[0] === "--filter") {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (cmd === "sh" && args[1]?.includes("command -v mrmr")) {
            return { status: 0, stdout: `${binDir}/mrmr\n`, stderr: "" };
          }
          return actual.spawnSync(cmd, args);
        }),
      };
    });

    const { linkCliGlobal, unlinkCliGlobal, devLinkMarkerPath } = await import("../scripts/dev-hmr-cli.js");
    linkCliGlobal(repoRoot);

    expect(existsSync(join(binDir, "mrmr"))).toBe(true);
    expect(readlinkSync(join(binDir, "mrmr"))).toBe(join(cliDist, "cli.js"));
    expect(existsSync(join(binDir, "murrmure-mcp"))).toBe(true);
    expect(readlinkSync(join(binDir, "murrmure-mcp"))).toBe(join(bridgeDist, "main.js"));
    expect(existsSync(devLinkMarkerPath(repoRoot))).toBe(true);

    unlinkCliGlobal(repoRoot);
    expect(existsSync(join(binDir, "mrmr"))).toBe(false);
    expect(existsSync(join(binDir, "murrmure-mcp"))).toBe(false);
    expect(existsSync(devLinkMarkerPath(repoRoot))).toBe(false);
  });
});

describe("dev-hmr-process", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("killProcessTree is a no-op for invalid pids", async () => {
    const { killProcessTree } = await import("../scripts/dev-hmr-process.js");
    expect(() => killProcessTree(undefined)).not.toThrow();
    expect(() => killProcessTree(0)).not.toThrow();
  });
});
