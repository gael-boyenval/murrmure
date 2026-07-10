import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testHomeRef = { value: "" };

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => testHomeRef.value,
  };
});

import {
  buildMcpConfigSnippet,
  probeMcpCatalog,
  resolveMcpBridgeCommand,
  rewriteFatMcpConfigFiles,
  scanMcpConfig,
} from "../src/lib/space-doctor-mcp.js";

describe("scanMcpConfig", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "cli-mcp-scan-"));
    testHomeRef.value = mkdtempSync(join(tmpdir(), "cli-mcp-home-"));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(testHomeRef.value, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  test("flags missing mcp config", () => {
    const { issues } = scanMcpConfig({ projectPath: projectDir, cwd: projectDir });
    expect(issues.some((issue) => issue.code === "MCP_CONFIG_MISSING")).toBe(true);
  });

  test("accepts canonical murrmure-mcp thin config", () => {
    const cursorDir = join(projectDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, "mcp.json"),
      buildMcpConfigSnippet({
        token: "${env:MURRMURE_HUB_TOKEN}",
      }),
    );

    const { issues } = scanMcpConfig({
      projectPath: projectDir,
      cwd: projectDir,
    });

    const blocking = issues.filter((issue) => issue.severity !== "info");
    expect(blocking).toHaveLength(0);
  });

  test("treats murrmure + args mcp as fat-shape error", () => {
    const cursorDir = join(projectDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            murrmure: {
              command: "murrmure",
              args: ["mcp"],
              env: {
                MURRMURE_HUB_URL: "http://127.0.0.1:8787",
                MURRMURE_HUB_TOKEN: "tok_real_grant",
                MURRMURE_SPACE_ID: "spc_demo",
              },
            },
          },
        },
        null,
        2,
      ),
    );

    const { issues } = scanMcpConfig({
      projectPath: projectDir,
      cwd: projectDir,
    });

    expect(issues.some((issue) => issue.code === "MCP_FAT_COMMAND_SHAPE")).toBe(true);
    expect(issues.some((issue) => issue.code === "MCP_FAT_ENV_KEYS")).toBe(true);
  });

  test("discovers global ~/.cursor/mcp.json", () => {
    const globalCursor = join(testHomeRef.value, ".cursor");
    mkdirSync(globalCursor, { recursive: true });
    writeFileSync(
      join(globalCursor, "mcp.json"),
      buildMcpConfigSnippet({
        token: "${env:MURRMURE_HUB_TOKEN}",
      }),
    );

    const { context, issues } = scanMcpConfig({
      projectPath: projectDir,
      cwd: projectDir,
    });

    expect(context.config_paths).toContain(join(globalCursor, "mcp.json"));
    expect(issues.some((issue) => issue.code === "MCP_CONFIG_MISSING")).toBe(false);
  });
});

describe("buildMcpConfigSnippet", () => {
  test("emits thin bridge shape only", () => {
    const snippet = buildMcpConfigSnippet({ token: "tok_agent" });
    expect(snippet).toContain("\"command\": \"murrmure-mcp\"");
    expect(snippet).not.toContain("\"args\"");
    expect(snippet).not.toContain("MURRMURE_HUB_URL");
    expect(snippet).not.toContain("MURRMURE_SPACE_ID");
  });

  test("resolveMcpBridgeCommand prefers Desktop-bundled path from shared.json", () => {
    const homePath = mkdtempSync(join(tmpdir(), "cli-mcp-bridge-home-"));
    testHomeRef.value = homePath;
    const hubsDir = join(homePath, ".murrmure", "hubs");
    mkdirSync(hubsDir, { recursive: true });
    writeFileSync(
      join(hubsDir, "shared.json"),
      JSON.stringify({
        hubs: [{ endpoint: "http://127.0.0.1:8787" }],
        mcp_bridge: { command: "/Applications/Murrmure.app/Contents/Resources/mcp-bridge/main.js" },
      }),
    );

    expect(resolveMcpBridgeCommand()).toBe(
      "/Applications/Murrmure.app/Contents/Resources/mcp-bridge/main.js",
    );
    expect(buildMcpConfigSnippet({ token: "tok_agent" })).toContain(
      "/Applications/Murrmure.app/Contents/Resources/mcp-bridge/main.js",
    );

    rmSync(homePath, { recursive: true, force: true });
  });
});

describe("rewriteFatMcpConfigFiles", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "cli-mcp-rewrite-"));
    testHomeRef.value = mkdtempSync(join(tmpdir(), "cli-mcp-rewrite-home-"));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(testHomeRef.value, { recursive: true, force: true });
  });

  test("rewrites fat murrmure command shape to thin bridge", () => {
    const cursorDir = join(projectDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            murrmure: {
              command: "murrmure",
              args: ["mcp"],
              env: {
                MURRMURE_HUB_URL: "http://127.0.0.1:8787",
                MURRMURE_SPACE_ID: "spc_demo",
                MURRMURE_HUB_TOKEN: "tok_space",
              },
            },
          },
        },
        null,
        2,
      ),
    );

    const rewrite = rewriteFatMcpConfigFiles({ configPaths: [configPath] });
    expect(rewrite.errors).toEqual([]);
    expect(rewrite.rewritten).toEqual([configPath]);

    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as {
      mcpServers: {
        murrmure: { command: string; args?: unknown; env: Record<string, string> };
      };
    };
    expect(parsed.mcpServers.murrmure.command).toBe("murrmure-mcp");
    expect(parsed.mcpServers.murrmure.args).toBeUndefined();
    expect(parsed.mcpServers.murrmure.env).toEqual({
      MURRMURE_HUB_TOKEN: "tok_space",
    });
  });

  test("keeps already-thin config unchanged", () => {
    const cursorDir = join(projectDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    const before = buildMcpConfigSnippet({ token: "${env:MURRMURE_HUB_TOKEN}" });
    writeFileSync(configPath, before);

    const rewrite = rewriteFatMcpConfigFiles({ configPaths: [configPath] });
    expect(rewrite.errors).toEqual([]);
    expect(rewrite.rewritten).toEqual([]);
    const after = readFileSync(configPath, "utf-8");
    expect(after).toBe(before);
  });
});

describe("probeMcpCatalog", () => {
  test("does not send space_id query parameter", async () => {
    const fetchSpy = vi.fn(async (input: URL | RequestInfo) => {
      const url = typeof input === "string" ? new URL(input) : new URL(String(input));
      expect(url.searchParams.has("space_id")).toBe(false);
      return new Response(JSON.stringify({ tools: [{ name: "murrmure_space_status" }] }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const issues = await probeMcpCatalog({
      hubUrl: "http://127.0.0.1:8787",
      token: "tok_probe",
    });

    expect(issues).toHaveLength(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
