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

async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 5_000,
): Promise<T> {
  const started = Date.now();
  while (true) {
    const value = await fn();
    if (predicate(value)) {
      return value;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out while waiting for expected MCP response");
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
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
  test("proxies list/call and relays hub wake without space_id", async () => {
    const wakePrompt = "Hub wake prompt: execute feedback action.";
    const audit: HubRequestAudit = { sawSpaceId: false, toolCalls: 0 };
    let handshakeDelivered = false;

    const hub = createServer(async (req, res) => {
      const host = req.headers.host ?? "127.0.0.1";
      const url = new URL(req.url ?? "/", `http://${host}`);

      if (url.searchParams.has("space_id")) {
        audit.sawSpaceId = true;
      }

      if (req.method === "GET" && url.pathname === "/v1/mcp/catalog") {
        return json(res, 200, {
          tools: [
            {
              name: "murrmure_space_status",
              description: "Read current space status",
              inputSchema: { type: "object", additionalProperties: true },
            },
          ],
        });
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
        const messages = handshakeDelivered
          ? []
          : [
              {
                method: "murrmure/control.invoke_action",
                params: {
                  seq: 1,
                  action_name: "write_improvement_feedback",
                  prompt: wakePrompt,
                },
              },
            ];
        handshakeDelivered = true;
        return json(res, 200, {
          handshake_ack_seq: 1,
          messages,
          server_tools: ["murrmure_space_status"],
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
        "import('./src/main.ts').then((m) => m.startMcpBridge({ bridgeArgv: ['--headless-ci'] }))",
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
      expect(names).toContain("murrmure_get_pending_wake");

      const invoked = await client.callTool({
        name: "murrmure_space_status",
        arguments: { ping: true },
      });
      const invokeText = firstText(invoked);
      expect(invokeText).toContain("\"status\":\"ok\"");
      expect(audit.toolCalls).toBeGreaterThanOrEqual(1);

      const wakeResult = await waitFor(
        async () =>
          client.callTool({
            name: "murrmure_get_pending_wake",
            arguments: {},
          }),
        (value) => firstText(value).includes(wakePrompt),
      );

      const wakeText = firstText(wakeResult);
      expect(wakeText).toContain(wakePrompt);
      expect(audit.sawSpaceId).toBe(false);
    } finally {
      await client.close();
      await new Promise<void>((resolveClosed) => {
        hub.close(() => resolveClosed());
      });
    }
  });
});
