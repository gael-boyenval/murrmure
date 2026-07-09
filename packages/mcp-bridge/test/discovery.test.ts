import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { discoverHubEndpoint, resolveSharedDiscoveryPath } from "../src/discovery.js";

const tempDirs: string[] = [];

function makeTempHome(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("discoverHubEndpoint", () => {
  test("reads endpoint from shared.json hubs array", () => {
    const homePath = makeTempHome("mcp-bridge-discovery-");
    const sharedPath = resolveSharedDiscoveryPath(homePath);
    mkdirSync(join(homePath, ".murrmure", "hubs"), { recursive: true });
    writeFileSync(
      sharedPath,
      JSON.stringify({
        hubs: [{ endpoint: "http://127.0.0.1:8787/" }],
      }),
    );

    expect(discoverHubEndpoint({ homePath })).toEqual({
      endpoint: "http://127.0.0.1:8787",
      sharedPath,
    });
  });

  test("supports legacy { url } discovery shape", () => {
    const homePath = makeTempHome("mcp-bridge-discovery-legacy-");
    const sharedPath = resolveSharedDiscoveryPath(homePath);
    mkdirSync(join(homePath, ".murrmure", "hubs"), { recursive: true });
    writeFileSync(sharedPath, JSON.stringify({ url: "http://localhost:9999/" }));

    expect(discoverHubEndpoint({ homePath }).endpoint).toBe("http://localhost:9999");
  });

  test("does not fall back to env when discovery file is missing", () => {
    const homePath = makeTempHome("mcp-bridge-discovery-missing-");
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:5000";
    expect(() => discoverHubEndpoint({ homePath })).toThrow(/Missing hub discovery file/);
    delete process.env.MURRMURE_HUB_URL;
  });

  test("fails when discovery has no usable endpoint", () => {
    const homePath = makeTempHome("mcp-bridge-discovery-empty-");
    const sharedPath = resolveSharedDiscoveryPath(homePath);
    mkdirSync(join(homePath, ".murrmure", "hubs"), { recursive: true });
    writeFileSync(sharedPath, JSON.stringify({ hubs: [{ endpoint: "not-a-url" }] }));

    expect(() => discoverHubEndpoint({ homePath })).toThrow(/No usable hub endpoint found/);
  });
});
