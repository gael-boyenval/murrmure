import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

import { probeMcpLiveHealth, scanMcpConfig } from "../src/lib/space-doctor-mcp.js";

function writeThinMcpConfig(projectDir: string, tokenValue = "${env:MURRMURE_HUB_TOKEN}"): void {
  const cursorDir = join(projectDir, ".cursor");
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(
    join(cursorDir, "mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          murrmure: {
            command: "murrmure-mcp",
            env: {
              MURRMURE_HUB_TOKEN: tokenValue,
            },
          },
        },
      },
      null,
      2,
    ),
  );
}

function writeSharedDiscovery(homePath: string, endpoint: string): void {
  const hubsDir = join(homePath, ".murrmure", "hubs");
  mkdirSync(hubsDir, { recursive: true });
  writeFileSync(
    join(hubsDir, "shared.json"),
    JSON.stringify({ hubs: [{ endpoint }] }, null, 2),
  );
}

function writeSpaceLink(projectDir: string, spaceId: string): void {
  const dir = join(projectDir, ".murrmure");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "link.json"),
    JSON.stringify({ space_id: spaceId, path: projectDir, host: "local" }, null, 2),
  );
}

function mockLiveFetch(options?: {
  healthStatus?: number;
  whoamiStatus?: number;
  whoamiSpaces?: string[];
  catalogStatus?: number;
  catalogTools?: Array<{ name: string; inputSchema?: Record<string, unknown> }>;
  invokeStatus?: number;
}): void {
  const whoamiSpaces = options?.whoamiSpaces ?? ["spc_demo"];
  const catalogTools =
    options?.catalogTools ??
    [
      {
        name: "murrmure_space_status",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      {
        name: "murrmure_resolve_step",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            run_id: { type: "string" },
            step_id: { type: "string" },
            branch: { type: "string" },
          },
          required: ["run_id", "step_id", "branch"],
        },
      },
    ];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | RequestInfo) => {
      const url = typeof input === "string" ? input : String(input);

      if (url.includes("/v1/health")) {
        return new Response(JSON.stringify({ ok: options?.healthStatus === undefined }), {
          status: options?.healthStatus ?? 200,
        });
      }
      if (url.includes("/v1/auth/whoami")) {
        if (options?.whoamiStatus && options.whoamiStatus >= 400) {
          return new Response(JSON.stringify({ message: "denied" }), { status: options.whoamiStatus });
        }
        return new Response(
          JSON.stringify({
            actor_id: "act_demo",
            kind: "grant",
            token_id: "tok_demo",
            spaces: whoamiSpaces.map((space_id) => ({
              space_id,
              scopes: ["space:read", "step:resolve"],
            })),
          }),
          { status: 200 },
        );
      }
      if (url.includes("/v1/mcp/catalog")) {
        if (options?.catalogStatus && options.catalogStatus >= 400) {
          return new Response(JSON.stringify({ message: "catalog denied" }), {
            status: options.catalogStatus,
          });
        }
        return new Response(JSON.stringify({ tools: catalogTools }), { status: 200 });
      }
      if (url.includes("/v1/mcp/tools/call")) {
        if (options?.invokeStatus && options.invokeStatus >= 400) {
          return new Response(JSON.stringify({ code: "token_denied", message: "Invalid or revoked token" }), {
            status: options.invokeStatus,
          });
        }
        return new Response(JSON.stringify({ result: { ok: true } }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

describe("probeMcpLiveHealth", () => {
  let projectDir: string;
  const envSnapshot = { ...process.env };

  async function runLiveProbe(authHubUrl = "http://127.0.0.1:8787", authToken = "tok_live") {
    const scan = scanMcpConfig({
      projectPath: projectDir,
      cwd: projectDir,
      authToken,
    });
    return probeMcpLiveHealth({
      projectPath: projectDir,
      cwd: projectDir,
      linkedSpaceId: "spc_demo",
      auth: {
        hubUrl: authHubUrl,
        token: authToken,
      },
      context: scan.context,
    });
  }

  beforeEach(() => {
    process.env = { ...envSnapshot };
    delete process.env.MURRMURE_HUB_TOKEN;
    delete process.env.MURRMURE_TOKEN;
    delete process.env.MURRMURE_DEPLOY_TOKEN;
    projectDir = mkdtempSync(join(tmpdir(), "cli-space-doctor-mcp-live-"));
    testHomeRef.value = mkdtempSync(join(tmpdir(), "cli-space-doctor-mcp-home-"));
    writeThinMcpConfig(projectDir);
    writeSpaceLink(projectDir, "spc_demo");
    writeSharedDiscovery(testHomeRef.value, "http://127.0.0.1:8787");
    process.env.MURRMURE_HUB_TOKEN = "tok_live";
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(testHomeRef.value, { recursive: true, force: true });
  });

  test("passes all Phase 4 live MCP checks with healthy fixtures", async () => {
    mockLiveFetch();
    const issues = await runLiveProbe();
    expect(issues).toEqual([]);
  });

  test("flags MCP_DISCOVERY when shared endpoint mismatches active hub", async () => {
    mockLiveFetch();
    writeSharedDiscovery(testHomeRef.value, "http://127.0.0.1:9999");
    const issues = await runLiveProbe("http://127.0.0.1:8787");
    expect(issues.some((issue) => issue.code === "MCP_DISCOVERY")).toBe(true);
  });

  test("flags MCP_CONFIG_SHAPE for MURRMURE_HUB_URL/MURRMURE_SPACE_ID in mcp.json", () => {
    const cursorDir = join(projectDir, ".cursor");
    writeFileSync(
      join(cursorDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            murrmure: {
              command: "murrmure-mcp",
              env: {
                MURRMURE_HUB_URL: "http://127.0.0.1:8787",
                MURRMURE_SPACE_ID: "spc_demo",
                MURRMURE_HUB_TOKEN: "${env:MURRMURE_HUB_TOKEN}",
              },
            },
          },
        },
        null,
        2,
      ),
    );
    const { issues } = scanMcpConfig({ projectPath: projectDir, cwd: projectDir });
    expect(issues.some((issue) => issue.code === "MCP_CONFIG_SHAPE")).toBe(true);
  });

  test("flags MCP_CONNECTION_SET when no local connection is configured", async () => {
    mockLiveFetch();
    delete process.env.MURRMURE_HUB_TOKEN;
    writeFileSync(
      join(projectDir, ".cursor", "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            murrmure: {
              command: "murrmure-mcp",
              env: {},
            },
          },
        },
        null,
        2,
      ),
    );

    const issues = await runLiveProbe();
    expect(issues.some((issue) => issue.code === "MCP_CONNECTION_SET")).toBe(true);
  });

  test("flags MCP_CONNECTION_SPACE_MATCH for ISSUE-07 linked-space mismatch", async () => {
    mockLiveFetch({ whoamiSpaces: ["spc_other"] });
    const issues = await runLiveProbe();
    expect(issues.some((issue) => issue.code === "MCP_CONNECTION_SPACE_MATCH")).toBe(true);
  });

  test("flags MCP_CATALOG_LIVE when required tools are missing", async () => {
    mockLiveFetch({
      catalogTools: [{ name: "murrmure_space_status", inputSchema: { type: "object" } }],
    });
    const issues = await runLiveProbe();
    expect(issues.some((issue) => issue.code === "MCP_CATALOG_LIVE")).toBe(true);
  });

  test("flags MCP_SCHEMA_PRESENT when resolve_step schema has no required fields", async () => {
    mockLiveFetch({
      catalogTools: [
        { name: "murrmure_space_status", inputSchema: { type: "object" } },
        { name: "murrmure_resolve_step", inputSchema: { type: "object", properties: {} } },
      ],
    });
    const issues = await runLiveProbe();
    expect(issues.some((issue) => issue.code === "MCP_SCHEMA_PRESENT")).toBe(true);
  });

  test("flags MCP_PROBE_INVOKE on revoked/wrong grant (HTTP 403)", async () => {
    mockLiveFetch({ invokeStatus: 403 });
    const issues = await runLiveProbe();
    expect(issues.some((issue) => issue.code === "MCP_PROBE_INVOKE")).toBe(true);
  });
});
