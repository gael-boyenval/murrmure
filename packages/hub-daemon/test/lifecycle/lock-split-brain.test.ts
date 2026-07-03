import { describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startHubDaemon } from "../../src/main.js";

describe("lifecycle/lock-split-brain", () => {
  test("healthy lock owner blocks second hub startup", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-lock-split-brain-"));
    const databasePath = join(dir, "murrmure.db");
    const dataDir = join(dir, "data");
    let first: Awaited<ReturnType<typeof startHubDaemon>> | null = null;

    try {
      first = await startHubDaemon({
        databasePath,
        port: 0,
        dataDir,
        defaultSpaceId: "",
        bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
        embedded: true,
      });

      await expect(
        startHubDaemon({
          databasePath,
          port: 0,
          dataDir,
          defaultSpaceId: "",
          bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
          embedded: true,
        }),
      ).rejects.toThrow(/hub_already_running/);
    } finally {
      if (first) {
        await first.shutdown();
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("stale lock with dead pid is reclaimed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-lock-reclaim-"));
    const dataDir = join(dir, "data");
    const databasePath = join(dir, "murrmure.db");
    mkdirSync(join(dataDir, "hub.lock"), { recursive: true });
    writeFileSync(
      join(dataDir, "hub.lock", "owner.json"),
      JSON.stringify({
        pid: 9_999_999_999,
        started_at: new Date().toISOString(),
        endpoint: "http://127.0.0.1:59999",
        database_path: databasePath,
      }),
    );

    let daemon: Awaited<ReturnType<typeof startHubDaemon>> | null = null;
    try {
      daemon = await startHubDaemon({
        databasePath,
        port: 0,
        dataDir,
        defaultSpaceId: "",
        bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
        embedded: true,
      });
      expect(daemon.port).toBeGreaterThan(0);
    } finally {
      if (daemon) {
        await daemon.shutdown();
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
