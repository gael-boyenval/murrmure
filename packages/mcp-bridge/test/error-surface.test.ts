import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { fetchCatalog, callTool, performHandshake } from "../src/hub-client.js";
import { resolveBridgeConfig } from "../src/main.js";

const tempDirs: string[] = [];
const envSnapshot = { ...process.env };

function makeTempHome(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeSharedDiscovery(homePath: string, endpoint: string): void {
  mkdirSync(join(homePath, ".murrmure", "hubs"), { recursive: true });
  writeFileSync(
    join(homePath, ".murrmure", "hubs", "shared.json"),
    JSON.stringify({ hubs: [{ endpoint }] }),
  );
}

afterEach(() => {
  process.env = { ...envSnapshot };
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("bridge error surfaces", () => {
  test("local mode requires a connection descriptor and does not use env fallback", () => {
    const homePath = makeTempHome("mcp-bridge-errors-config-");
    writeSharedDiscovery(homePath, "http://127.0.0.1:8787");
    process.env.MURRMURE_HUB_TOKEN = "tok_must_not_be_used";

    expect(() => resolveBridgeConfig({ homePath, argv: [] })).toThrow(
      /requires --hub .* --connection/,
    );
  });

  test("local mode resolves the OS credential by Hub and connection ID", () => {
    const homePath = makeTempHome("mcp-bridge-errors-local-");
    writeSharedDiscovery(homePath, "http://127.0.0.1:8787");
    process.env.MURRMURE_HUB_TOKEN = "tok_must_not_be_used";
    const config = resolveBridgeConfig({
      homePath,
      argv: [
        "--hub",
        "http://127.0.0.1:8787",
        "--connection",
        "con_local",
      ],
      readCredential: (hubId, connectionId) => {
        expect(hubId).toBe("http://127.0.0.1:8787");
        expect(connectionId).toBe("con_local");
        return "tok_from_store";
      },
    });
    expect(config.authMode).toBe("local");
    expect(config.token).toBe("tok_from_store");
  });

  test("handler assignment mode uses ephemeral authority without reading the connection", () => {
    const config = resolveBridgeConfig({
      argv: [
        "--hub",
        "http://127.0.0.1:8787",
        "--connection",
        "con_local",
      ],
      env: {
        MURRMURE_ASSIGNMENT_SCOPE: "run_live:build:dev_build",
        MURRMURE_HUB_TOKEN: "tok_ephemeral",
      },
      readCredential: () => {
        throw new Error("persistent credential must not be read");
      },
    });
    expect(config.authMode).toBe("assignment");
    expect(config.token).toBe("tok_ephemeral");
  });

  test("handler assignment mode fails closed without its ephemeral token", () => {
    expect(() =>
      resolveBridgeConfig({
        argv: [
          "--hub",
          "http://127.0.0.1:8787",
          "--connection",
          "con_local",
        ],
        env: { MURRMURE_ASSIGNMENT_SCOPE: "run_live:build:dev_build" },
      }),
    ).toThrow(/requires MURRMURE_HUB_TOKEN/);
  });

  test("headless CI mode explicitly accepts runtime secret injection", () => {
    const homePath = makeTempHome("mcp-bridge-errors-ci-");
    writeSharedDiscovery(homePath, "http://127.0.0.1:8787");
    process.env.MURRMURE_HUB_TOKEN = "tok_ci";
    const config = resolveBridgeConfig({
      homePath,
      argv: ["--headless-ci"],
    });
    expect(config.authMode).toBe("headless-ci");
    expect(config.token).toBe("tok_ci");
  });

  test("fetchCatalog reports non-JSON responses", async () => {
    await expect(
      fetchCatalog({
        hubUrl: "http://127.0.0.1:8787",
        token: "tok_test",
        fetchImpl: async () => new Response("not-json", { status: 500 }),
      }),
    ).rejects.toThrow(/returned non-JSON/);
  });

  test("callTool surfaces HTTP status without leaking token", async () => {
    const token = "tok_super_secret";
    await expect(
      callTool({
        hubUrl: "http://127.0.0.1:8787",
        token,
        name: "murrmure_space_status",
        arguments: {},
        fetchImpl: async () =>
          new Response(JSON.stringify({ code: "forbidden" }), { status: 403 }),
      }),
    ).rejects.toThrow(/HTTP 403/);

    try {
      await callTool({
        hubUrl: "http://127.0.0.1:8787",
        token,
        name: "murrmure_space_status",
        arguments: {},
        fetchImpl: async () =>
          new Response(JSON.stringify({ code: "forbidden" }), { status: 403 }),
      });
      expect.unreachable();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      expect(detail).not.toContain(token);
    }
  });

  test("performHandshake surfaces non-JSON errors", async () => {
    await expect(
      performHandshake({
        hubUrl: "http://127.0.0.1:8787",
        token: "tok_test",
        clientId: "client-1",
        lastAckSeq: 0,
        fetchImpl: async () => new Response("<html>offline</html>", { status: 503 }),
      }),
    ).rejects.toThrow(/returned non-JSON/);
  });
});
