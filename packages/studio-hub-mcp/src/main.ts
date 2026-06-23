#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readHubToken, readHubUrl, readSpaceId } from "./env.js";

const HUB_URL = readHubUrl();
const TOKEN = readHubToken();
const SPACE_ID = readSpaceId();

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN}`,
  };
}

interface CatalogTool {
  name: string;
  description?: string;
  package_id?: string;
}

async function fetchCatalog(): Promise<CatalogTool[]> {
  const url = new URL(`${HUB_URL}/v1/mcp/catalog`);
  if (SPACE_ID) url.searchParams.set("space_id", SPACE_ID);

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
  const url = new URL(`${HUB_URL}/v1/mcp/tools/call`);
  if (SPACE_ID) url.searchParams.set("space_id", SPACE_ID);

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

const catalog = await fetchCatalog();
if (catalog.length === 0) {
  console.error(
    "studio-hub-mcp: no tools in catalog — check STUDIO_SPACE_ID, grant token, and live capabilities",
  );
}

const server = new Server(
  { name: "studio-hub", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: catalog.map((tool) => ({
    name: tool.name,
    description:
      tool.description ?? (tool.package_id ? `${tool.package_id} tool` : tool.name),
    inputSchema: { type: "object", additionalProperties: true },
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
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

const transport = new StdioServerTransport();
await server.connect(transport);
