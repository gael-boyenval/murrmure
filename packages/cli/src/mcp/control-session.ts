import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { formatControlWake } from "./wake-prompt.js";
import { writePendingWakeFile, type PendingWakeRecord } from "./pending-wake.js";

export interface ControlMessage {
  method: string;
  params: Record<string, unknown> & { seq?: number };
}

export interface HandshakeResponse {
  handshake_ack_seq: number;
  messages: ControlMessage[];
  server_tools?: string[];
}

export interface ControlSessionConfig {
  hubUrl: string;
  spaceId: string;
  token: string;
  clientId?: string;
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
  onToolsChanged?: (added: string[], removed: string[]) => void;
  onWake?: (record: PendingWakeRecord) => void;
}

export interface ControlSession {
  start(server: Server): void;
  stop(): void;
  handshakeOnce(): Promise<HandshakeResponse>;
  getPendingWake(): PendingWakeRecord | null;
  clearPendingWake(): PendingWakeRecord | null;
}

const DEFAULT_POLL_MS = 5_000;

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export function resolveMcpClientId(spaceId: string): string {
  const fromEnv = process.env.MURRMURE_MCP_CLIENT_ID?.trim();
  if (fromEnv) return fromEnv;

  const bare = spaceId.replace(/^spc_/, "");
  const dir = join(homedir(), ".murrmure", "mcp-sessions");
  const path = join(dir, `${bare || "default"}.client-id`);
  if (existsSync(path)) {
    const stored = readFileSync(path, "utf8").trim();
    if (stored) return stored;
  }

  const id = randomUUID();
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${id}\n`, "utf8");
  return id;
}

function lastAckPath(spaceId: string): string {
  const bare = spaceId.replace(/^spc_/, "");
  return join(homedir(), ".murrmure", "mcp-sessions", `${bare || "default"}.last-ack-seq`);
}

export function readPersistedLastAckSeq(spaceId: string): number {
  const path = lastAckPath(spaceId);
  if (!existsSync(path)) return 0;
  const parsed = Number(readFileSync(path, "utf8").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function writePersistedLastAckSeq(spaceId: string, seq: number): void {
  const path = lastAckPath(spaceId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${seq}\n`, "utf8");
}

export function maxControlSeq(messages: ControlMessage[]): number {
  let max = 0;
  for (const message of messages) {
    const seq = Number(message.params.seq ?? 0);
    if (seq > max) max = seq;
  }
  return max;
}

export function isWakeMessage(method: string): boolean {
  return (
    method === "murrmure/control.invoke_action" ||
    method === "murrmure/control.wake_pending"
  );
}

export async function performHandshake(
  config: Pick<ControlSessionConfig, "hubUrl" | "spaceId" | "token" | "clientId"> & {
    lastAckSeq: number;
    fetchImpl?: typeof fetch;
  },
): Promise<HandshakeResponse> {
  const fetchFn = config.fetchImpl ?? fetch;
  const res = await fetchFn(`${config.hubUrl}/v1/mcp/session/handshake`, {
    method: "POST",
    headers: authHeaders(config.token),
    body: JSON.stringify({
      space_id: config.spaceId,
      client_id: config.clientId ?? resolveMcpClientId(config.spaceId),
      last_ack_seq: config.lastAckSeq,
    }),
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `MCP handshake returned non-JSON (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `MCP handshake failed (${res.status}): ${typeof body === "object" ? JSON.stringify(body) : text}`,
    );
  }

  const parsed = body as HandshakeResponse;
  if (!Array.isArray(parsed.messages)) {
    throw new Error("MCP handshake response missing messages array");
  }
  return parsed;
}

function messageSeq(message: ControlMessage): number {
  return Number(message.params.seq ?? 0);
}

function buildPendingWakeRecord(
  method: string,
  params: Record<string, unknown>,
  prompt: string,
): PendingWakeRecord {
  return {
    received_at: new Date().toISOString(),
    method,
    action_name:
      typeof params.action_name === "string" ? params.action_name : undefined,
    run_id: typeof params.run_id === "string" ? params.run_id : undefined,
    session_id: typeof params.session_id === "string" ? params.session_id : undefined,
    prompt,
  };
}

async function deliverWake(
  server: Server,
  method: string,
  params: Record<string, unknown>,
  onWake?: (record: PendingWakeRecord) => void,
): Promise<boolean> {
  const prompt = formatControlWake(method, params);
  if (!prompt) return true;

  const record = buildPendingWakeRecord(method, params, prompt);
  writePendingWakeFile(record);
  onWake?.(record);

  console.error(`murrmure/wake:\n${prompt}\n`);

  try {
    await server.sendLoggingMessage({
      level: "error",
      logger: "murrmure",
      data: prompt,
    });
  } catch {
    // Logging is best-effort.
  }

  try {
    await server.createMessage({
      messages: [{ role: "user", content: { type: "text", text: prompt } }],
      maxTokens: 8192,
      systemPrompt:
        "You are a Murrmure-connected agent. When woken for murrmure/control.invoke_action or murrmure/control.wake_pending, execute the requested work using your tools and local workspace immediately.",
    });
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`murrmure/wake: createMessage failed (${detail}) — pending wake saved to .murrmure/pending-wake.json`);
    return false;
  }
}

export function createControlSession(config: ControlSessionConfig): ControlSession {
  const clientId = config.clientId ?? resolveMcpClientId(config.spaceId);
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_MS;
  let lastAckSeq = readPersistedLastAckSeq(config.spaceId);
  let timer: ReturnType<typeof setInterval> | undefined;
  let serverRef: Server | undefined;
  let polling = false;
  let pendingWake: PendingWakeRecord | null = null;

  async function processMessages(server: Server, messages: ControlMessage[]): Promise<number> {
    let ackThrough = lastAckSeq;
    for (const message of messages) {
      const seq = messageSeq(message);
      if (seq <= lastAckSeq) continue;

      if (message.method === "murrmure/control.tools_changed") {
        const added = Array.isArray(message.params.added)
          ? (message.params.added as string[])
          : [];
        const removed = Array.isArray(message.params.removed)
          ? (message.params.removed as string[])
          : [];
        config.onToolsChanged?.(added, removed);
        ackThrough = Math.max(ackThrough, seq);
        continue;
      }

      if (isWakeMessage(message.method)) {
        const delivered = await deliverWake(
          server,
          message.method,
          message.params,
          (record) => {
            pendingWake = record;
            config.onWake?.(record);
          },
        );
        if (delivered) {
          ackThrough = Math.max(ackThrough, seq);
        }
        continue;
      }

      ackThrough = Math.max(ackThrough, seq);
    }
    return ackThrough;
  }

  async function pollOnce(): Promise<void> {
    if (polling || !serverRef) return;
    polling = true;
    try {
      const body = await performHandshake({
        hubUrl: config.hubUrl,
        spaceId: config.spaceId,
        token: config.token,
        clientId,
        lastAckSeq,
        fetchImpl: config.fetchImpl,
      });
      const ackThrough = await processMessages(serverRef, body.messages);
      lastAckSeq = Math.max(lastAckSeq, ackThrough, body.handshake_ack_seq);
      writePersistedLastAckSeq(config.spaceId, lastAckSeq);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`murrmure/mcp: handshake poll failed (${detail})`);
    } finally {
      polling = false;
    }
  }

  async function waitForClientReady(server: Server): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.getClientCapabilities()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return {
    start(server: Server) {
      serverRef = server;
      void (async () => {
        await waitForClientReady(server);
        await pollOnce();
      })();
      timer = setInterval(() => {
        void pollOnce();
      }, pollIntervalMs);
      timer.unref?.();
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      serverRef = undefined;
    },

    async handshakeOnce() {
      const body = await performHandshake({
        hubUrl: config.hubUrl,
        spaceId: config.spaceId,
        token: config.token,
        clientId,
        lastAckSeq,
        fetchImpl: config.fetchImpl,
      });
      if (serverRef) {
        const ackThrough = await processMessages(serverRef, body.messages);
        lastAckSeq = Math.max(lastAckSeq, ackThrough, body.handshake_ack_seq);
      } else {
        lastAckSeq = Math.max(lastAckSeq, body.handshake_ack_seq, maxControlSeq(body.messages));
      }
      writePersistedLastAckSeq(config.spaceId, lastAckSeq);
      return body;
    },

    getPendingWake() {
      return pendingWake;
    },

    clearPendingWake() {
      const current = pendingWake;
      pendingWake = null;
      return current;
    },
  };
}
