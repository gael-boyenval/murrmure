import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  discoverHubEndpoint,
  resolveSharedDiscoveryPath,
} from "./discovery.js";
import {
  callTool,
  fetchCatalog,
  performHandshake,
  type CatalogTool,
  type ControlMessage,
} from "./hub-client.js";
import {
  buildPendingWakeRecord,
  isWakeMessage,
  writePendingWakeFile,
  type PendingWakeRecord,
} from "./wake-relay.js";
import { readMacOsConnectionToken } from "./credential-store.js";

const PENDING_WAKE_TOOL = "murrmure_get_pending_wake";
const DEFAULT_POLL_INTERVAL_MS = 5_000;

export interface BridgeConfig {
  hubUrl: string;
  token: string;
  discoveryPath: string;
  connectionId?: string;
  authMode: "local" | "assignment" | "headless-ci";
}

export interface StartMcpBridgeOptions {
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  bridgeArgv?: string[];
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  return resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
}

function argumentValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1]?.trim() : undefined;
  return value || undefined;
}

function normalizeHubId(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Local --hub must be an http(s) Hub URL.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function maxSeq(messages: ControlMessage[]): number {
  let max = 0;
  for (const message of messages) {
    const seq = Number(message.params.seq ?? 0);
    if (seq > max) {
      max = seq;
    }
  }
  return max;
}

async function waitForClientReady(server: Server): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.getClientCapabilities()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
}

function mapCatalogTools(tools: CatalogTool[]): Array<{
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}> {
  return tools.map((tool) => ({
    name: tool.name,
    description:
      tool.description ?? (tool.flow_id ? `${tool.flow_id} tool` : tool.name),
    inputSchema: tool.inputSchema ?? { type: "object", additionalProperties: true },
  }));
}

export function resolveBridgeConfig(options?: {
  homePath?: string;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  readCredential?: (hubId: string, connectionId: string) => string;
}): BridgeConfig {
  const argv = options?.argv ?? process.argv.slice(2);
  const env = options?.env ?? process.env;
  if (argv.includes("--headless-ci")) {
    const explicitHub = argumentValue(argv, "--hub");
    const discovery = explicitHub
      ? null
      : discoverHubEndpoint({ homePath: options?.homePath });
    const token = env.MURRMURE_HUB_TOKEN?.trim() ?? "";
    if (!token) {
      throw new Error(
        "Headless CI mode requires MURRMURE_HUB_TOKEN runtime secret injection.",
      );
    }
    return {
      hubUrl: explicitHub ? normalizeHubId(explicitHub) : discovery!.endpoint,
      token,
      discoveryPath:
        discovery?.sharedPath ?? resolveSharedDiscoveryPath(options?.homePath),
      authMode: "headless-ci",
    };
  }

  const hubId = argumentValue(argv, "--hub");
  const connectionId = argumentValue(argv, "--connection");
  if (!hubId || !connectionId) {
    throw new Error(
      "Local mode requires --hub <hub-id> and --connection <connection-id>; run mrmr connection create.",
    );
  }
  if (!connectionId.startsWith("con_")) {
    throw new Error("Local --connection must begin with con_.");
  }
  const hubUrl = normalizeHubId(hubId);
  const assignmentScope = env.MURRMURE_ASSIGNMENT_SCOPE?.trim();
  const assignmentToken = env.MURRMURE_HUB_TOKEN?.trim();
  if (assignmentScope) {
    if (!assignmentToken) {
      throw new Error(
        "Assignment MCP startup requires MURRMURE_HUB_TOKEN.",
      );
    }
    const [runId, stepId, handlerId, ...extra] = assignmentScope.split(":");
    if (!runId || !stepId || !handlerId || extra.length > 0) {
      throw new Error(
        "MURRMURE_ASSIGNMENT_SCOPE must be {run_id}:{step_id}:{handler_id}.",
      );
    }
    return {
      hubUrl,
      token: assignmentToken,
      discoveryPath: resolveSharedDiscoveryPath(options?.homePath),
      connectionId,
      authMode: "assignment",
    };
  }
  const token = (options?.readCredential ?? readMacOsConnectionToken)(
    hubUrl,
    connectionId,
  );
  return {
    hubUrl,
    token,
    discoveryPath: resolveSharedDiscoveryPath(options?.homePath),
    connectionId,
    authMode: "local",
  };
}

async function relayWakePrompt(
  server: Server,
  message: ControlMessage,
): Promise<PendingWakeRecord | null> {
  const prompt = typeof message.params.prompt === "string" ? message.params.prompt : "";
  if (!prompt.trim()) {
    return null;
  }

  const record = buildPendingWakeRecord(message, prompt);
  writePendingWakeFile(record);
  // Keep the rendered hub prompt verbatim for stderr visibility.
  console.error(prompt);

  try {
    await server.createMessage({
      messages: [{ role: "user", content: { type: "text", text: prompt } }],
      maxTokens: 8192,
      systemPrompt:
        "You are a Murrmure-connected agent. Execute control wakes immediately using your tools and local workspace.",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      `murrmure-mcp wake relay failed (${detail}) — pending wake saved to .mrmr/dev/pending-wake.json`,
    );
  }

  return record;
}

async function sendToolListChanged(server: Server): Promise<void> {
  try {
    await server.sendToolListChanged();
  } catch {
    // Client capability dependent; treat as best-effort.
  }
}

export async function startMcpBridge(options: StartMcpBridgeOptions = {}): Promise<void> {
  const config = resolveBridgeConfig({ argv: options.bridgeArgv });
  const fetchImpl = options.fetchImpl ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const clientId = `murrmure-mcp-${randomUUID()}`;

  let catalogTools = await fetchCatalog({
    hubUrl: config.hubUrl,
    token: config.token,
    fetchImpl,
  });
  let pendingWake: PendingWakeRecord | null = null;
  let lastAckSeq = 0;
  let polling = false;

  const server = new Server(
    { name: "murrmure-mcp-bridge", version: "0.1.0" },
    {
      capabilities: { tools: {}, logging: {} },
      instructions:
        "Murrmure MCP bridge. Call murrmure_get_pending_wake at session start to read the last relayed wake prompt.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: PENDING_WAKE_TOOL,
        description: "Returns the latest relayed Murrmure wake prompt.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      ...mapCatalogTools(catalogTools),
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === PENDING_WAKE_TOOL) {
      return {
        content: [
          {
            type: "text",
            text: pendingWake?.prompt ?? "No pending Murrmure control wake.",
          },
        ],
      };
    }

    try {
      const result = await callTool({
        hubUrl: config.hubUrl,
        token: config.token,
        name,
        arguments: (args ?? {}) as Record<string, unknown>,
        fetchImpl,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "Hub tool call failed",
          },
        ],
        isError: true,
      };
    }
  });

  async function refreshCatalog(): Promise<void> {
    catalogTools = await fetchCatalog({
      hubUrl: config.hubUrl,
      token: config.token,
      fetchImpl,
    });
  }

  async function pollHandshake(): Promise<void> {
    if (polling) return;
    polling = true;
    try {
      const handshake = await performHandshake({
        hubUrl: config.hubUrl,
        token: config.token,
        clientId,
        lastAckSeq,
        fetchImpl,
      });
      for (const message of handshake.messages) {
        const seq = Number(message.params.seq ?? 0);
        if (seq <= lastAckSeq) {
          continue;
        }
        if (message.method === "murrmure/control.tools_changed") {
          await refreshCatalog();
          await sendToolListChanged(server);
          continue;
        }
        if (isWakeMessage(message.method)) {
          const relayed = await relayWakePrompt(server, message);
          if (relayed) {
            pendingWake = relayed;
            await sendToolListChanged(server);
          }
        }
      }
      lastAckSeq = Math.max(lastAckSeq, handshake.handshake_ack_seq, maxSeq(handshake.messages));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`murrmure-mcp handshake poll failed (${detail})`);
    } finally {
      polling = false;
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  await waitForClientReady(server);
  await pollHandshake();

  const timer = setInterval(() => {
    void pollHandshake();
  }, pollIntervalMs);
  timer.unref?.();
  server.onclose = () => {
    clearInterval(timer);
  };
}

if (isMainModule()) {
  void startMcpBridge().catch((error) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`murrmure-mcp failed to start: ${detail}`);
    process.exit(1);
  });
}
