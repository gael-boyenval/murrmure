import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { fetchCatalog, callTool, performHandshake } from "../src/hub-client.js";
import { bridgeInstructions, resolveBridgeConfig } from "../src/main.js";
import { isMeetingSaidMessage, isWakeMessage } from "../src/wake-relay.js";

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

function writeActiveConnection(
  homePath: string,
  active: {
    hub_id: string;
    connection_id: string;
    space_id: string;
    profile: string;
  },
): void {
  mkdirSync(join(homePath, ".murrmure", "connections"), { recursive: true });
  writeFileSync(
    join(homePath, ".murrmure", "connections", "active.json"),
    JSON.stringify(active),
  );
}

afterEach(() => {
  process.env = { ...envSnapshot };
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("bridge error surfaces", () => {
  test("local mode requires an active connection and does not use env fallback", () => {
    const homePath = makeTempHome("mcp-bridge-errors-config-");
    writeSharedDiscovery(homePath, "http://127.0.0.1:8787");
    process.env.MURRMURE_HUB_TOKEN = "tok_must_not_be_used";

    expect(() => resolveBridgeConfig({ homePath, argv: [] })).toThrow(
      /requires --connection/,
    );
  });

  test("local mode resolves hub from discovery and credential from active connection", () => {
    const homePath = makeTempHome("mcp-bridge-errors-local-");
    writeSharedDiscovery(homePath, "http://127.0.0.1:8787");
    writeActiveConnection(homePath, {
      hub_id: "http://127.0.0.1:8787",
      connection_id: "con_local",
      space_id: "spc_local",
      profile: "local-tools/v1",
    });
    process.env.MURRMURE_HUB_TOKEN = "tok_must_not_be_used";
    const config = resolveBridgeConfig({
      homePath,
      argv: [],
      readCredential: (hubId, connectionId) => {
        expect(hubId).toBe("http://127.0.0.1:8787");
        expect(connectionId).toBe("con_local");
        return "tok_from_store";
      },
    });
    expect(config.authMode).toBe("local");
    expect(config.hubUrl).toBe("http://127.0.0.1:8787");
    expect(config.connectionId).toBe("con_local");
    expect(config.token).toBe("tok_from_store");
  });

  test("local mode prefers --connection over active pointer", () => {
    const homePath = makeTempHome("mcp-bridge-errors-pin-");
    writeSharedDiscovery(homePath, "http://127.0.0.1:8787");
    writeActiveConnection(homePath, {
      hub_id: "http://127.0.0.1:8787",
      connection_id: "con_active",
      space_id: "spc_other",
      profile: "local-tools/v1",
    });
    mkdirSync(join(homePath, ".murrmure", "connections", "by-id"), { recursive: true });
    writeFileSync(
      join(homePath, ".murrmure", "connections", "by-id", "con_pinned.json"),
      JSON.stringify({
        hub_id: "http://127.0.0.1:8787",
        connection_id: "con_pinned",
        space_id: "spc_local",
        profile: "local-tools/v1",
        status: "active",
      }),
    );
    const config = resolveBridgeConfig({
      homePath,
      argv: ["--connection", "con_pinned"],
      readCredential: (hubId, connectionId) => {
        expect(hubId).toBe("http://127.0.0.1:8787");
        expect(connectionId).toBe("con_pinned");
        return "tok_pinned";
      },
    });
    expect(config.authMode).toBe("local");
    expect(config.hubUrl).toBe("http://127.0.0.1:8787");
    expect(config.connectionId).toBe("con_pinned");
    expect(config.token).toBe("tok_pinned");
  });

  test("local mode still accepts explicit --hub/--connection overrides", () => {
    const homePath = makeTempHome("mcp-bridge-errors-override-");
    writeSharedDiscovery(homePath, "http://127.0.0.1:8787");
    writeActiveConnection(homePath, {
      hub_id: "http://127.0.0.1:8787",
      connection_id: "con_active",
      space_id: "spc_local",
      profile: "local-tools/v1",
    });
    const config = resolveBridgeConfig({
      homePath,
      argv: [
        "--hub",
        "http://127.0.0.1:9999",
        "--connection",
        "con_override",
      ],
      readCredential: (hubId, connectionId) => {
        expect(hubId).toBe("http://127.0.0.1:9999");
        expect(connectionId).toBe("con_override");
        return "tok_override";
      },
    });
    expect(config.authMode).toBe("local");
    expect(config.hubUrl).toBe("http://127.0.0.1:9999");
    expect(config.token).toBe("tok_override");
  });

  test("handler assignment mode uses ephemeral authority without reading the connection", () => {
    const homePath = makeTempHome("mcp-bridge-errors-assignment-");
    writeSharedDiscovery(homePath, "http://127.0.0.1:8787");
    const config = resolveBridgeConfig({
      homePath,
      argv: [],
      env: {
        MURRMURE_ASSIGNMENT_SCOPE: "run_live:build:dev_build",
        MURRMURE_HUB_TOKEN: "tok_ephemeral",
      },
      readCredential: () => {
        throw new Error("persistent credential must not be read");
      },
    });
    expect(config.authMode).toBe("assignment");
    expect(config.hubUrl).toBe("http://127.0.0.1:8787");
    expect(config.token).toBe("tok_ephemeral");
    expect(bridgeInstructions("assignment")).toContain("Do not call murrmure_get_pending_wake");
    expect(bridgeInstructions("local")).toContain("murrmure_get_pending_wake");
  });

  test("handler assignment mode fails closed without its ephemeral token", () => {
    const homePath = makeTempHome("mcp-bridge-errors-assignment-missing-");
    writeSharedDiscovery(homePath, "http://127.0.0.1:8787");
    expect(() =>
      resolveBridgeConfig({
        homePath,
        argv: [],
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

  test("meeting_said is not a pending-wake method", () => {
    expect(isWakeMessage("murrmure/control.invoke_action")).toBe(true);
    expect(isWakeMessage("murrmure/control.meeting_said")).toBe(false);
    expect(isMeetingSaidMessage("murrmure/control.meeting_said")).toBe(true);
    expect(isMeetingSaidMessage("murrmure/control.invoke_action")).toBe(false);
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
