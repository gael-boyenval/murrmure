import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, test } from "vitest";

describe("Tutorial v3 MCP conformance", () => {
  test.skip("Task 02 — local connection resolves credentials without file tokens", () => {});
  test.skip("Task 05 — agent artifact submission matches branch upload contracts", () => {});
  test("Task 07 — fake agent resolves build through the real MCP bridge", async () => {
    const assignmentToken = "tok_task_07_ephemeral";
    let receivedAuthorization = "";
    let receivedCall: Record<string, unknown> | undefined;
    const hub = createServer(async (req, res) => {
      receivedAuthorization = String(req.headers.authorization ?? "");
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const body = chunks.length
        ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>)
        : {};
      res.setHeader("content-type", "application/json");
      if (req.method === "GET" && url.pathname === "/v1/mcp/catalog") {
        res.end(JSON.stringify({
          tools: [{
            name: "murrmure_resolve_step",
            inputSchema: {
              type: "object",
              required: ["run_id", "step_id", "branch"],
              properties: {
                run_id: { type: "string" },
                step_id: { type: "string" },
                branch: { type: "string" },
                payload: { type: "object" },
              },
            },
          }],
        }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/mcp/session/handshake") {
        res.end(JSON.stringify({ handshake_ack_seq: 0, messages: [], server_tools: [] }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/mcp/tools/call") {
        receivedCall = body;
        res.end(JSON.stringify({
          result: {
            ok: true,
            run_id: (body.arguments as Record<string, unknown>).run_id,
            step_id: (body.arguments as Record<string, unknown>).step_id,
            branch: (body.arguments as Record<string, unknown>).branch,
          },
        }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ code: "not_found" }));
    });
    await new Promise<void>((resolve) => hub.listen(0, "127.0.0.1", resolve));
    const port = (hub.address() as AddressInfo).port;
    const home = mkdtempSync(join(tmpdir(), "murrmure-task-07-"));
    const packageRoot = join(import.meta.dirname, "..");
    const env = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
    const transport = new StdioClientTransport({
      command: "node",
      args: [
        "--import",
        "tsx",
        "-e",
        `import('./src/main.ts').then((m) => m.startMcpBridge({ bridgeArgv: ['--hub', 'http://127.0.0.1:${port}', '--connection', 'con_tutorial'] }))`,
      ],
      cwd: packageRoot,
      env: {
        ...env,
        HOME: home,
        MURRMURE_ASSIGNMENT_SCOPE: "run_01LIVE:build:dev_build",
        MURRMURE_HUB_TOKEN: assignmentToken,
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "tutorial-v3-fake-agent", version: "1.0.0" });
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: "murrmure_resolve_step",
        arguments: {
          run_id: "run_01LIVE",
          step_id: "build",
          branch: "completed",
          payload: {
            commit_message: "feat: build tutorial",
            description: "Built the requested tutorial feature.",
          },
        },
      });
      expect(result.isError).not.toBe(true);
      expect(receivedAuthorization).toBe(`Bearer ${assignmentToken}`);
      expect(receivedCall).toMatchObject({
        name: "murrmure_resolve_step",
        arguments: {
          run_id: "run_01LIVE",
          step_id: "build",
          branch: "completed",
        },
      });
    } finally {
      await client.close();
      await new Promise<void>((resolve) => hub.close(() => resolve()));
      rmSync(home, { recursive: true, force: true });
    }
  });
});

