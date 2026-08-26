import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface HubRequestAudit {
  sawSpaceId: boolean;
  toolCalls: number;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function cleanEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return { ...env, ...extra };
}

function firstText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) return "";
  const entry = content[0];
  if (!entry || typeof entry !== "object") return "";
  const text = (entry as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("stdio bridge proxy", () => {
  test("proxies list/call and refetches catalog without space_id", async () => {
    const audit: HubRequestAudit = { sawSpaceId: false, toolCalls: 0 };

    let includeDirective = false;
    const hub = createServer(async (req, res) => {
      const host = req.headers.host ?? "127.0.0.1";
      const url = new URL(req.url ?? "/", `http://${host}`);

      if (url.searchParams.has("space_id")) {
        audit.sawSpaceId = true;
      }

      if (req.method === "GET" && url.pathname === "/v1/mcp/catalog") {
        const tools: Array<Record<string, unknown>> = [
          {
            name: "murrmure_space_status",
            description: "Read current space status",
            inputSchema: { type: "object", additionalProperties: true },
          },
        ];
        if (includeDirective) {
          tools.push({
            name: "murrmure_start_directive",
            description: "Start a directive",
            inputSchema: { type: "object", properties: { prompt: { type: "string" } } },
          });
        }
        return json(res, 200, { tools });
      }

      if (req.method === "POST" && url.pathname === "/v1/mcp/tools/call") {
        const body = JSON.parse((await readBody(req)) || "{}") as Record<string, unknown>;
        if ("space_id" in body) {
          audit.sawSpaceId = true;
        }
        audit.toolCalls += 1;
        return json(res, 200, {
          result: {
            status: "ok",
            echoed_name: body.name,
            echoed_arguments: body.arguments ?? {},
          },
        });
      }

      if (req.method === "POST" && url.pathname === "/v1/mcp/session/handshake") {
        const body = JSON.parse((await readBody(req)) || "{}") as Record<string, unknown>;
        if ("space_id" in body) {
          audit.sawSpaceId = true;
        }
        return json(res, 200, {
          handshake_ack_seq: 1,
          messages: [],
          server_tools: includeDirective
            ? ["murrmure_space_status", "murrmure_start_directive"]
            : ["murrmure_space_status"],
        });
      }

      return json(res, 404, { code: "not_found" });
    });

    await new Promise<void>((resolveReady) => {
      hub.listen(0, "127.0.0.1", () => resolveReady());
    });
    const hubPort = (hub.address() as AddressInfo).port;

    const homePath = mkdtempSync(join(tmpdir(), "mcp-bridge-stdio-home-"));
    tempDirs.push(homePath);
    mkdirSync(join(homePath, ".murrmure", "hubs"), { recursive: true });
    writeFileSync(
      join(homePath, ".murrmure", "hubs", "shared.json"),
      JSON.stringify({
        hubs: [{ endpoint: `http://127.0.0.1:${hubPort}` }],
      }),
    );

    const packageRoot = join(import.meta.dirname, "..");
    const transport = new StdioClientTransport({
      command: "node",
      args: [
        "--import",
        "tsx",
        "-e",
        `import('./src/main.ts').then((m) => m.startMcpBridge({ bridgeArgv: ['--headless-ci', '--hub', 'http://127.0.0.1:${hubPort}'] }))`,
      ],
      cwd: packageRoot,
      env: cleanEnv({
        HOME: homePath,
        MURRMURE_HUB_TOKEN: "tok_test_bridge",
        MURRMURE_SPACE_ROOT: homePath,
      }),
      stderr: "pipe",
    });
    const stderrChunks: string[] = [];
    transport.stderr?.on("data", (chunk) => {
      stderrChunks.push(String(chunk));
    });
    const client = new Client({ name: "bridge-integration-test", version: "0.0.0" });

    try {
      try {
        await client.connect(transport);
      } catch (error) {
        const stderr = stderrChunks.join("").trim();
        throw new Error(
          stderr
            ? `Bridge failed to connect over stdio: ${stderr}`
            : `Bridge failed to connect over stdio: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const listed = await client.listTools();
      const names = listed.tools.map((tool) => tool.name);
      expect(names).toContain("murrmure_space_status");
      expect(names).not.toContain("murrmure_start_directive");

      includeDirective = true;
      const relisted = await client.listTools();
      const relistedNames = relisted.tools.map((tool) => tool.name);
      expect(relistedNames).toContain("murrmure_space_status");
      expect(relistedNames).toContain("murrmure_start_directive");

      const invoked = await client.callTool({
        name: "murrmure_space_status",
        arguments: { ping: true },
      });
      const invokeText = firstText(invoked);
      expect(invokeText).toContain("\"status\":\"ok\"");
      expect(audit.toolCalls).toBeGreaterThanOrEqual(1);
      expect(audit.sawSpaceId).toBe(false);
    } finally {
      await client.close();
      await new Promise<void>((resolveClosed) => {
        hub.close(() => resolveClosed());
      });
    }
  });
});
