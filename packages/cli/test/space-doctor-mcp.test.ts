import { describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildMcpConfigSnippet, scanMcpConfig } from "../src/lib/space-doctor-mcp.js";

describe("scanMcpConfig", () => {
  test("flags missing mcp.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-mcp-scan-"));
    const { issues } = scanMcpConfig({ projectPath: dir, cwd: dir });
    expect(issues.some((issue) => issue.code === "MCP_CONFIG_MISSING")).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("detects legacy studio MCP command and env", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-mcp-legacy-"));
    const cursorDir = join(dir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            studio: {
              command: "studio-hub-mcp",
              env: {
                STUDIO_HUB_URL: "http://127.0.0.1:8787",
                STUDIO_HUB_TOKEN: "tok_old",
                STUDIO_SPACE_ID: "spc_old",
              },
            },
          },
        },
        null,
        2,
      ),
    );

    const { issues, context } = scanMcpConfig({
      projectPath: dir,
      cwd: dir,
      linkedSpaceId: "spc_linked",
    });

    expect(context.servers).toHaveLength(1);
    expect(issues.some((issue) => issue.code === "MCP_LEGACY_COMMAND")).toBe(true);
    expect(issues.some((issue) => issue.code === "MCP_LEGACY_ENV")).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("detects space id mismatch with linked space", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-mcp-mismatch-"));
    const cursorDir = join(dir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, "mcp.json"),
      buildMcpConfigSnippet({
        hubUrl: "http://127.0.0.1:8787",
        token: "tok_real_grant",
        spaceId: "spc_wrong",
      }),
    );

    const { issues } = scanMcpConfig({
      projectPath: dir,
      cwd: dir,
      linkedSpaceId: "spc_linked",
      authHubUrl: "http://127.0.0.1:8787",
    });

    expect(issues.some((issue) => issue.code === "MCP_SPACE_MISMATCH")).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("flags deprecated murrmure-mcp binary", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-mcp-alias-"));
    const cursorDir = join(dir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            murrmure: {
              command: "murrmure-mcp",
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
      projectPath: dir,
      cwd: dir,
      linkedSpaceId: "spc_demo",
    });

    expect(issues.some((issue) => issue.code === "MCP_LEGACY_COMMAND")).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("accepts canonical murrmure mcp config", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-mcp-ok-"));
    const cursorDir = join(dir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, "mcp.json"),
      buildMcpConfigSnippet({
        hubUrl: "http://127.0.0.1:8787",
        token: "tok_real_grant",
        spaceId: "spc_demo",
      }),
    );

    const { issues } = scanMcpConfig({
      projectPath: dir,
      cwd: dir,
      linkedSpaceId: "spc_demo",
      authHubUrl: "http://127.0.0.1:8787",
    });

    expect(issues.filter((issue) => issue.severity === "warning" && issue.code.startsWith("MCP_"))).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });
});
