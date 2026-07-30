import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const testHomeRef = { value: "" };

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => testHomeRef.value,
  };
});

import { formatDoctorHuman, runDoctor } from "../src/lib/doctor.js";
import { resolveAuthSource } from "../src/lib/auth-source.js";

describe("resolveAuthSource", () => {
  const env = { ...process.env };

  beforeEach(() => {
    testHomeRef.value = mkdtempSync(join(tmpdir(), "murrmure-doctor-auth-source-"));
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = { ...env };
    if (testHomeRef.value) {
      rmSync(testHomeRef.value, { recursive: true, force: true });
      testHomeRef.value = "";
    }
  });

  test("prefers flags over env", () => {
    process.env.MURRMURE_HUB_URL = "http://env.example";
    process.env.MURRMURE_HUB_TOKEN = "tok_env";
    expect(resolveAuthSource({ hubUrl: "http://flag.example", token: "tok_flag" })).toBe("flags");
  });

  test("detects env when no flags", () => {
    process.env.MURRMURE_HUB_URL = "http://env.example";
    process.env.MURRMURE_HUB_TOKEN = "tok_env";
    expect(resolveAuthSource()).toBe("env");
  });

  test("detects active connection source when env is absent", () => {
    const connectionsDir = join(testHomeRef.value, ".murrmure", "connections");
    mkdirSync(connectionsDir, { recursive: true });
    writeFileSync(
      join(connectionsDir, "active.json"),
      JSON.stringify({
        hub_id: "http://127.0.0.1:8787",
        connection_id: "con_local",
        space_id: "spc_ui_sandbox",
        profile: "local-tools/v1",
      }),
    );
    expect(resolveAuthSource()).toBe("active-connection");
  });

  test("prefers credentials over active connection", () => {
    const murrmureDir = join(testHomeRef.value, ".murrmure");
    mkdirSync(join(murrmureDir, "connections"), { recursive: true });
    writeFileSync(
      join(murrmureDir, "credentials"),
      JSON.stringify({
        version: 1,
        hubUrl: "http://127.0.0.1:8787",
        token: "tok_cred",
        savedAt: new Date().toISOString(),
      }),
    );
    writeFileSync(
      join(murrmureDir, "connections", "active.json"),
      JSON.stringify({
        hub_id: "http://127.0.0.1:8787",
        connection_id: "con_local",
        space_id: "spc_ui_sandbox",
        profile: "local-tools/v1",
      }),
    );
    expect(resolveAuthSource()).toBe("credentials");
  });
});

describe("runDoctor", () => {
  const env = { ...process.env };

  beforeEach(() => {
    testHomeRef.value = mkdtempSync(join(tmpdir(), "murrmure-doctor-"));
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = { ...env };
    if (testHomeRef.value) {
      rmSync(testHomeRef.value, { recursive: true, force: true });
      testHomeRef.value = "";
    }
  });

  test("reports AUTH_MISSING when no auth configured", async () => {
    const result = await runDoctor({ hubUrl: undefined, token: undefined });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("AUTH_MISSING");
    expect(result.profile.spaces).toEqual([]);
  });

  test("formatDoctorHuman is scannable and collapses MCP notes", () => {
    const text = formatDoctorHuman({
      ok: true,
      issues: [
        {
          code: "MCP_CONNECTION_SET",
          severity: "warning",
          message: "Local tools are not connected yet",
          fix: "Open Murrmure Desktop and connect tools, or finish mrmr setup — then reload MCP",
          paths: [
            "/Users/test/.cursor/mcp.json",
            "/repo/.cursor/mcp.json",
          ],
        },
        {
          code: "MCP_CONNECTION_SET",
          severity: "warning",
          message: "Local tools are not connected yet",
          paths: ["/Users/test/.cursor/mcp.json"],
        },
      ],
      profile: {
        auth_source: "credentials",
        hub_url: "http://127.0.0.1:8787",
        hub_reachable: true,
        token_valid: true,
        bootstrap_token: true,
        whoami: {
          actor_id: "actor_bootstrap",
          kind: "human",
          token_id: "tok_x",
          spaces: [],
        },
        spaces: [
          {
            space_id: "spc_demo",
            slug: "demo",
            name: "Demo",
            scopes: ["space:admin", "space:read"],
            capabilities: {
              can_apply_space: true,
              can_mint_grants: true,
              can_register_triggers: true,
            },
            executors: [
              {
                name: "cursor-mcp",
                type: "mcp_session",
                reachable: null,
                detail: "needs connected MCP session",
              },
            ],
          },
        ],
      },
    });
    expect(text).toContain("Hub     http://127.0.0.1:8787  ✓");
    expect(text).toContain("Spaces  (1)");
    expect(text).toContain("demo  (spc_demo)");
    expect(text).toContain("admin · apply · triggers");
    expect(text).toContain("Notes");
    expect(text).toContain("Local tools are not connected yet");
    expect(text).toContain("Open Murrmure Desktop and connect tools");
    expect(text).not.toContain("MCP_CONNECTION_SET");
    expect(text).not.toContain("--hub");
    expect(text).not.toContain("SCOPES");
    expect(text.match(/Local tools are not connected yet/g)?.length).toBe(1);
  });
});
