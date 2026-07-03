import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startHubDaemon } from "../../src/main.js";

describe("lifecycle/embedded-lifecycle", () => {
  test("embedded shutdown releases lock and allows restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-embedded-lifecycle-"));
    const databasePath = join(dir, "murrmure.db");
    const dataDir = join(dir, "data");
    let first: Awaited<ReturnType<typeof startHubDaemon>> | null = null;
    let second: Awaited<ReturnType<typeof startHubDaemon>> | null = null;

    try {
      first = await startHubDaemon({
        databasePath,
        port: 0,
        dataDir,
        defaultSpaceId: "",
        bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
        embedded: true,
      });

      const firstHealth = await fetch(`http://127.0.0.1:${first.port}/v1/health`);
      expect(firstHealth.status).toBe(200);

      await first.shutdown();
      first = null;

      second = await startHubDaemon({
        databasePath,
        port: 0,
        dataDir,
        defaultSpaceId: "",
        bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
        embedded: true,
      });

      const secondHealth = await fetch(`http://127.0.0.1:${second.port}/v1/health`);
      expect(secondHealth.status).toBe(200);
    } finally {
      if (second) {
        await second.shutdown();
      }
      if (first) {
        await first.shutdown();
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
