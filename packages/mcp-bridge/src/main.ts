import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readActiveConnection } from "./active-connection.js";
import {
  discoverHubEndpoint,
  readHubInstance,
  resolveSharedDiscoveryPath,
} from "./discovery.js";
import { readStoredConnection } from "./stored-connection.js";
import {
  callTool,
  fetchCatalog,
  performHandshake,
  type CatalogTool,
  type ControlMessage,
} from "./hub-client.js";
import {
  buildPendingWakeRecord,
  coalesceMeetingSaidMessages,
  isMeetingSaidMessage,
  isWakeMessage,
  writePendingWakeFile,
  type PendingWakeRecord,
} from "./wake-relay.js";
import { readMacOsConnectionToken } from "./credential-store.js";
import { ensureObjectInputSchema } from "./input-schema.js";
import {
  handshakeSeqReset,
  hubInstanceChanged,
  hubInstanceKey,
  hubToolNamesChanged,
} from "./catalog-refresh.js";

const PENDING_WAKE_TOOL = "murrmure_get_pending_wake";
export const DEFAULT_POLL_INTERVAL_MS = 750;
export const MEETING_RESPONSE_MAX_TOKENS = 1200;
export const MEETING_SAID_SYSTEM_PROMPT =
  "You are a live Murrmure meeting seat. One or more said events arrived. Pull murrmure_meeting_transcript once with session_id and since_seq. You may stay silent: emit mrmr.meeting.said only when directly addressed or when you have distinct useful content. Never repeat, paraphrase, acknowledge, or re-introduce material already in the transcript. Keep a reply concise (normally 1-3 short paragraphs), set in_reply_to when appropriate, and target the relevant speaker with to.participant_ids; use to.all only when everyone genuinely needs the message. Do not call murrmure_resolve_step for this room.";

export function meetingAssignmentFromEnv(
  env: NodeJS.ProcessEnv,
): { session_id: string; participant_id: string } | undefined {
  const session_id = env.MURRMURE_MEETING_SESSION_ID?.trim();
  const participant_id = env.MURRMURE_MEETING_PARTICIPANT_ID?.trim();
  if (!session_id?.startsWith("ses_") || !participant_id?.startsWith("ptc_")) {
    return undefined;
  }
  return { session_id, participant_id };
}

const LOCAL_BRIDGE_INSTRUCTIONS =
  "Murrmure MCP bridge. Call murrmure_get_pending_wake at session start only when you were woken by a Murrmure hook/control message — not for ordinary chat.";

const ASSIGNMENT_BRIDGE_INSTRUCTIONS =
  "Murrmure MCP bridge (handler assignment). Execute the Task in your prompt, then call murrmure_resolve_step using the Contracts block. Do not call murrmure_get_pending_wake. Do not run space_health / list_handlers bootstrap first.";

export interface BridgeConfig {
  hubUrl: string;
  token: string;
  discoveryPath: string;
  connectionId?: string;
  authMode: "local" | "assignment" | "headless-ci";
}

export function bridgeInstructions(authMode: BridgeConfig["authMode"]): string {
  if (authMode === "assignment") return ASSIGNMENT_BRIDGE_INSTRUCTIONS;
  if (authMode === "headless-ci") {
    return "Murrmure MCP bridge (headless CI). Use hub tools as needed for the scripted job. Do not call murrmure_get_pending_wake.";
  }
  return LOCAL_BRIDGE_INSTRUCTIONS;
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

function resolveHubDiscovery(options: {
  homePath?: string;
  explicitHub?: string;
}): { endpoint: string; sharedPath: string } {
  if (options.explicitHub) {
    return {
      endpoint: normalizeHubId(options.explicitHub),
      sharedPath: resolveSharedDiscoveryPath(options.homePath),
    };
  }
  return discoverHubEndpoint({ homePath: options.homePath });
}

function normalizeHubId(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Hub must be an http(s) URL.");
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
    inputSchema: ensureObjectInputSchema(tool.inputSchema),
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
    const discovery = resolveHubDiscovery({
      homePath: options?.homePath,
      explicitHub,
    });
    const token = env.MURRMURE_HUB_TOKEN?.trim() ?? "";
    if (!token) {
      throw new Error(
        "Headless CI mode requires MURRMURE_HUB_TOKEN runtime secret injection.",
      );
    }
    return {
      hubUrl: discovery.endpoint,
      token,
      discoveryPath: discovery.sharedPath,
      authMode: "headless-ci",
    };
  }

  // Local MCP clients pin --connection (space). Hub comes from Desktop
  // discovery — never from mcp.json. Explicit --hub remains accepted only as a
  // transitional/override; adapters do not write it.
  const explicitHub = argumentValue(argv, "--hub");
  const explicitConnection = argumentValue(argv, "--connection");
  const discovery = resolveHubDiscovery({
    homePath: options?.homePath,
    explicitHub,
  });
  const hubUrl = discovery.endpoint;
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
      discoveryPath: discovery.sharedPath,
      connectionId: explicitConnection,
      authMode: "assignment",
    };
  }

  const active = readActiveConnection(options?.homePath);
  const connectionId = explicitConnection ?? active?.connection_id;
  if (!connectionId) {
    throw new Error(
      "Local mode requires --connection <con_…> (or an active connection). Run mrmr connection create.",
    );
  }
  if (!connectionId.startsWith("con_")) {
    throw new Error("Local connection id must begin with con_.");
  }
  const stored = readStoredConnection(connectionId, options?.homePath);
  const credentialHubId = explicitHub
    ? normalizeHubId(explicitHub)
    : (stored?.hub_id ?? active?.hub_id ?? hubUrl);
  const token = (options?.readCredential ?? readMacOsConnectionToken)(
    credentialHubId,
    connectionId,
  );
  return {
    hubUrl,
    token,
    discoveryPath: discovery.sharedPath,
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
  const meetingAssignment = meetingAssignmentFromEnv(process.env);

  let catalogTools = await fetchCatalog({
    hubUrl: config.hubUrl,
    token: config.token,
    fetchImpl,
  });
  let pendingWake: PendingWakeRecord | null = null;
  let lastAckSeq = 0;
  let polling = false;
  let announcedCatalog = false;
  let hubInstance = hubInstanceKey(readHubInstance(config.discoveryPath));

  const server = new Server(
    { name: "murrmure-mcp-bridge", version: "0.1.1" },
    {
      capabilities: { tools: {}, logging: {} },
      instructions: bridgeInstructions(config.authMode),
    },
  );

  const exposePendingWake = config.authMode === "local";

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    await refreshCatalog();
    return {
      tools: [
        ...(exposePendingWake
          ? [
              {
                name: PENDING_WAKE_TOOL,
                description:
                  "Returns the latest relayed Murrmure wake prompt (hook/control wake only — skip during handler assignments).",
                inputSchema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {},
                },
              },
            ]
          : []),
        ...mapCatalogTools(catalogTools),
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === PENDING_WAKE_TOOL) {
      if (!exposePendingWake) {
        return {
          content: [
            {
              type: "text",
              text: "Pending wake is not used in assignment mode. Execute the Task and call murrmure_resolve_step.",
            },
          ],
          isError: true,
        };
      }
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
    try {
      catalogTools = await fetchCatalog({
        hubUrl: config.hubUrl,
        token: config.token,
        fetchImpl,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`murrmure-mcp catalog refresh failed (${detail})`);
    }
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
        meetingAssignment,
        fetchImpl,
      });
      const ackSeq = Number(handshake.handshake_ack_seq ?? 0);
      const nextInstance = hubInstanceKey(readHubInstance(config.discoveryPath));
      const instanceReset = hubInstanceChanged(hubInstance, nextInstance);
      if (nextInstance) {
        hubInstance = nextInstance;
      }
      const seqReset = handshakeSeqReset(lastAckSeq, ackSeq);
      if (
        instanceReset ||
        seqReset ||
        hubToolNamesChanged(catalogTools, handshake.server_tools)
      ) {
        if (instanceReset || seqReset) {
          lastAckSeq = 0;
        }
        await refreshCatalog();
        // First poll races Client.connect; notify only after the client is up.
        if (announcedCatalog) {
          await sendToolListChanged(server);
        }
      }
      for (const message of coalesceMeetingSaidMessages(handshake.messages)) {
        const seq = Number(message.params.seq ?? 0);
        if (seq <= lastAckSeq) {
          continue;
        }
        if (message.method === "murrmure/control.tools_changed") {
          await refreshCatalog();
          await sendToolListChanged(server);
          continue;
        }
        if (isMeetingSaidMessage(message.method)) {
          // Join-once notify: assignment-mode must not drop this. Do not write
          // pending-wake.json — the seat is already running.
          const prompt =
            typeof message.params.prompt === "string" ? message.params.prompt : "";
          if (prompt.trim()) {
            console.error(prompt);
            try {
              await server.createMessage({
                messages: [{ role: "user", content: { type: "text", text: prompt } }],
                maxTokens: MEETING_RESPONSE_MAX_TOKENS,
                systemPrompt: MEETING_SAID_SYSTEM_PROMPT,
              });
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              console.error(`murrmure-mcp meeting_said relay failed (${detail})`);
            }
          }
          continue;
        }
        if (isWakeMessage(message.method)) {
          // Assignment / headless children must not receive hook wakes mid-task.
          if (config.authMode !== "local") {
            continue;
          }
          const relayed = await relayWakePrompt(server, message);
          if (relayed) {
            pendingWake = relayed;
            await sendToolListChanged(server);
          }
        }
      }
      lastAckSeq = Math.max(lastAckSeq, handshake.handshake_ack_seq, maxSeq(handshake.messages));
      announcedCatalog = true;
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
