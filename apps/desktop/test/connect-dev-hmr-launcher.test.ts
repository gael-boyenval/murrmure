import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { connectDevHmrServices } from "../src/runner.js";

describe("connectDevHmrServices", () => {
  const previous = {
    dataDir: process.env.MURRMURE_DATA_DIR,
    actorId: process.env.MURRMURE_BOOTSTRAP_ACTOR_ID,
    repoRoot: process.env.MURRMURE_REPO_ROOT,
  };
  let dataDir: string | undefined;

  afterEach(() => {
    if (previous.dataDir === undefined) {
      delete process.env.MURRMURE_DATA_DIR;
    } else {
      process.env.MURRMURE_DATA_DIR = previous.dataDir;
    }
    if (previous.actorId === undefined) {
      delete process.env.MURRMURE_BOOTSTRAP_ACTOR_ID;
    } else {
      process.env.MURRMURE_BOOTSTRAP_ACTOR_ID = previous.actorId;
    }
    if (previous.repoRoot === undefined) {
      delete process.env.MURRMURE_REPO_ROOT;
    } else {
      process.env.MURRMURE_REPO_ROOT = previous.repoRoot;
    }
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
      dataDir = undefined;
    }
  });

  test("installs the stable MCP launcher into the data dir", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "murrmure-hmr-launcher-"));
    process.env.MURRMURE_DATA_DIR = dataDir;
    process.env.MURRMURE_BOOTSTRAP_ACTOR_ID = "actor_test";
    process.env.MURRMURE_REPO_ROOT = join(import.meta.dirname, "../../..");

    const handle = await connectDevHmrServices();
    expect(existsSync(join(dataDir, "bin", "murrmure-mcp"))).toBe(true);
    expect(handle.paths.mcpLauncherCommand).toBe(join(dataDir, "bin", "murrmure-mcp"));
  });
});
