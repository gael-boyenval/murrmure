import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createControlSession, type ControlSession } from "./control-session.js";
import { readHubToken, readHubUrl, readSpaceId } from "./env.js";

const PENDING_WAKE_TOOL = "murrmure_get_pending_wake";

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${readHubToken()}`,
  };
}

interface CatalogTool {
  name: string;
  description?: string;
  flow_id?: string;
  inputSchema?: Record<string, unknown>;
}

async function fetchCatalog(): Promise<CatalogTool[]> {
  const hubUrl = readHubUrl();
  const spaceId = readSpaceId();
  const url = new URL(`${hubUrl}/v1/mcp/catalog`);
  if (spaceId) url.searchParams.set("space_id", spaceId);

  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Hub catalog returned non-JSON (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `Hub catalog failed (${res.status}): ${typeof body === "object" ? JSON.stringify(body) : text}`,
    );
  }
  const tools = (body as { tools?: CatalogTool[] }).tools;
  if (!Array.isArray(tools)) {
    throw new Error("Hub catalog response missing tools array");
  }
  return tools;
}

async function invokeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const hubUrl = readHubUrl();
  const spaceId = readSpaceId();
  const url = new URL(`${hubUrl}/v1/mcp/tools/call`);
  if (spaceId) url.searchParams.set("space_id", spaceId);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name, arguments: args }),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Tool ${name} returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(
      `Tool ${name} failed (${res.status}): ${typeof body === "object" ? JSON.stringify(body) : text}`,
    );
  }
  return (body as { result?: unknown }).result ?? body;
}

export async function startMcpServer(): Promise<void> {
  const hubUrl = readHubUrl();
  const spaceId = readSpaceId();
  const token = readHubToken();
  if (!token) {
    throw new Error("MURRMURE_HUB_TOKEN (or MURRMURE_TOKEN) is required for murrmure mcp");
  }
  if (!spaceId) {
    throw new Error("MURRMURE_SPACE_ID is required for murrmure mcp");
  }

  const catalog = await fetchCatalog();
  if (catalog.length === 0) {
    console.error(
      "murrmure mcp: no tools in catalog — check MURRMURE_SPACE_ID, grant token, and hub",
    );
  }

  let catalogTools = catalog;
  let controlSession: ControlSession | undefined;

  const server = new Server(
    { name: "murrmure-hub", version: "0.1.0" },
    {
      capabilities: { tools: {}, logging: {} },
      instructions:
        "Murrmure MCP bridge. On connect, call murrmure_get_pending_wake first. Hook wakes arrive as murrmure/control.invoke_action — execute immediately (write files, run tools). Also check .murrmure/pending-wake.json if a wake was missed.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: PENDING_WAKE_TOOL,
        description:
          "Return and clear the latest Murrmure control-bus wake (hook invoke_action). Call on session start and after tool list changes.",
        inputSchema: { type: "object", additionalProperties: false, properties: {} },
      },
      ...catalogTools.map((tool) => ({
        name: tool.name,
        description:
          tool.description ?? (tool.flow_id ? `${tool.flow_id} tool` : tool.name),
        inputSchema: tool.inputSchema ?? { type: "object", additionalProperties: true },
      })),
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === PENDING_WAKE_TOOL) {
      const wake = controlSession?.clearPendingWake();
      return {
        content: [
          {
            type: "text",
            text: wake?.prompt ?? "No pending Murrmure control wake.",
          },
        ],
      };
    }

    try {
      const result = await invokeTool(name, (args ?? {}) as Record<string, unknown>);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: e instanceof Error ? e.message : "Invoke failed" }],
        isError: true,
      };
    }
  });

  controlSession = createControlSession({
    hubUrl,
    spaceId,
    token,
    onToolsChanged: () => {
      void fetchCatalog()
        .then((tools) => {
          catalogTools = tools;
        })
        .catch((error) => {
          const detail = error instanceof Error ? error.message : String(error);
          console.error(`murrmure/mcp: catalog refresh failed (${detail})`);
        });
    },
    onWake: async () => {
      try {
        await server.sendToolListChanged();
      } catch {
        // Best-effort nudge for clients watching tool list changes.
      }
    },
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  controlSession.start(server);
}
