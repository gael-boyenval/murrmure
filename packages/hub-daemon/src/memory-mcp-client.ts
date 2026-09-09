import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DaemonConfig } from "./context.js";
import { resolveDataDir } from "./ops.js";
import { reapMemoryMcpForDb } from "./memory-mcp-process.js";
import { readSubjectNames } from "./memory-subjects.js";

export interface MemoryToolCallResult {
  payload: unknown;
  isError: boolean;
}

export interface MemoryMcpClient {
  isReady(): boolean;
  subjectsPath?(): string | null;
  subjectNames?(): string[];
  callTool(name: string, args: Record<string, unknown>): Promise<MemoryToolCallResult>;
  stop(): Promise<void>;
}

export const DISABLED_MEMORY_MCP: MemoryMcpClient = {
  isReady: () => false,
  subjectsPath: () => null,
  subjectNames: () => [],
  callTool: async () => {
    throw new Error("Memory MCP is disabled");
  },
  stop: async () => undefined,
};

/** Assignment/prompt fields Hub must not send. Engine API fields (tags, subjects, includeBasedOn) stay. */
const HUB_ONLY_FIELDS = new Set(["consumer_space", "enough", "question"]);

export function stripHubOnlyMemoryArgs(args: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (HUB_ONLY_FIELDS.has(key) || value === undefined) continue;
    next[key] = value;
  }
  return next;
}

export function unwrapMcpToolResult(raw: unknown): MemoryToolCallResult {
  if (!raw || typeof raw !== "object") {
    return { payload: raw, isError: false };
  }
  const result = raw as { isError?: boolean; content?: Array<{ text?: string }> };
  const text = result.content?.[0]?.text;
  let payload: unknown = raw;
  if (typeof text === "string") {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = { text };
    }
  }
  const payloadError =
    payload !== null && typeof payload === "object" && "error" in payload
      ? Boolean((payload as { error?: unknown }).error)
      : false;
  return { payload, isError: Boolean(result.isError) || payloadError };
}

type StoredFact = { id: string; text: string; tags: string[]; subjects: string[] };

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function matchesTagFilter(factTags: string[], raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
  const filter = raw as { tags?: unknown; untagged?: unknown };
  const requested = stringList(filter.tags);
  const untagged = filter.untagged === "exclude" ? "exclude" : "include";
  if (factTags.length === 0) return untagged === "include";
  if (requested.length === 0) return false;
  return requested.some((tag) => factTags.includes(tag));
}

function projectFact(row: StoredFact, bank: string): Record<string, unknown> {
  return {
    id: row.id,
    bank,
    text: row.text,
    factType: "world",
    occurredAt: new Date().toISOString(),
    proofCount: 0,
    subjects: row.subjects,
    tags: row.tags,
  };
}

export class InMemoryMemoryMcp implements MemoryMcpClient {
  private readonly banks = new Map<string, StoredFact[]>();
  private ready = true;
  private nextId = 1;
  private handbookNames: string[] = [];

  isReady(): boolean {
    return this.ready;
  }

  subjectsPath(): string | null {
    return null;
  }

  subjectNames(): string[] {
    return this.handbookNames;
  }

  setSubjectNames(names: string[]): void {
    this.handbookNames = names;
  }

  setReady(ready: boolean): void {
    this.ready = ready;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MemoryToolCallResult> {
    if (!this.ready) {
      return { payload: { error: "Memory MCP unavailable" }, isError: true };
    }
    const bank = String(args.bank ?? "");
    const rows = this.banks.get(bank) ?? [];
    if (name === "retain") {
      const text = String(args.content ?? "");
      const id = `fact_${this.nextId++}`;
      const tags = stringList(args.tags);
      const subjects = stringList(args.subjects);
      const next = [...rows, { id, text, tags, subjects }];
      this.banks.set(bank, next);
      return {
        payload: { status: "ok", documentId: `doc_${id}`, facts: [{ id, text, subjects, tags }] },
        isError: false,
      };
    }
    if (name === "recall") {
      const query = String(args.query ?? "").toLowerCase();
      const results = rows
        .filter((row) => !query || row.text.toLowerCase().includes(query) || query === ".")
        .filter((row) => matchesTagFilter(row.tags, args.tags))
        .map((row) => projectFact(row, bank));
      return { payload: { results }, isError: false };
    }
    if (name === "recent") {
      return {
        payload: {
          results: rows.filter((row) => matchesTagFilter(row.tags, args.tags)).map((row) => projectFact(row, bank)),
        },
        isError: false,
      };
    }
    if (name === "reflect") {
      const query = String(args.query ?? "").toLowerCase();
      const hit = rows
        .filter((row) => matchesTagFilter(row.tags, args.tags))
        .find((row) => !query || row.text.toLowerCase().includes(query));
      return {
        payload: {
          answer: hit?.text ?? null,
          ...(args.includeBasedOn === true && hit ? { basedOn: [projectFact(hit, bank)] } : {}),
        },
        isError: false,
      };
    }
    if (name === "retire") {
      const id = String(args.id ?? "");
      const kept = rows.filter((row) => row.id !== id);
      this.banks.set(bank, kept);
      return {
        payload: { status: kept.length === rows.length ? "already-retired" : "retired", id },
        isError: kept.length === rows.length && rows.every((row) => row.id !== id),
      };
    }
    return { payload: { error: `Unknown memory tool ${name}` }, isError: true };
  }

  async stop(): Promise<void> {
    this.ready = false;
  }
}

export function shouldStartMemoryMcp(config: DaemonConfig): boolean {
  if (config.memoryMcp === false) return false;
  if (config.memoryMcp) return false;
  if (process.env.MURRMURE_MEMORY_MCP === "0") return false;
  if (process.env.VITEST) return false;
  return true;
}

export function resolveMemoryPackageRoot(): string | null {
  const envRoot = process.env.MURRMURE_MEMORY_PACKAGE_ROOT;
  if (envRoot && existsSync(join(envRoot, "src/mcp/index.ts"))) return envRoot;

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../../../memory"),
    join(process.cwd(), "memory"),
    join(process.cwd(), "../memory"),
    join(homedir(), "web/GBworkspace/memory"),
  ];
  for (const root of candidates) {
    if (existsSync(join(root, "src/mcp/index.ts"))) return root;
  }
  return null;
}

export async function startStdioMemoryMcp(
  config: DaemonConfig,
  subjectsPath?: string | null,
): Promise<MemoryMcpClient> {
  const packageRoot = resolveMemoryPackageRoot();
  if (!packageRoot) {
    console.warn("[murrmure] memory-mcp skipped — memory package not found");
    return DISABLED_MEMORY_MCP;
  }

  const entry = join(packageRoot, "src/mcp/index.ts");
  const dbPath = process.env.MURRMURE_MEMORY_DB_PATH ?? join(resolveDataDir(config), "memory.db");
  const profile = process.env.MURRMURE_MEMORY_PROFILE ?? "serve";
  const handbook = subjectsPath?.trim() || process.env.MURRMURE_MEMORY_SUBJECTS?.trim() || null;
  const handbookNames = handbook ? readSubjectNames(handbook) : [];
  const args = [entry, "--db", dbPath, "--profile", profile];
  if (handbook) {
    args.push("--subjects", handbook);
  }

  try {
    // tsx watch / HMR SIGKILL the hub without reaping grandchildren. Kill leftovers
    // for this db before spawn so we never accumulate bun memory-mcp cores.
    await reapMemoryMcpForDb(dbPath);
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    const transport = new StdioClientTransport({
      command: process.env.BUN_BIN ?? "bun",
      args,
      cwd: packageRoot,
    });
    const client = new Client({ name: "murrmure-hub", version: "0.0.0" });
    await client.connect(transport);
    let childPid = transport.pid ?? null;
    const onExit = () => {
      if (childPid) {
        try {
          process.kill(childPid, "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    };
    process.once("exit", onExit);
    try {
      await client.listTools();
    } catch (error) {
      process.off("exit", onExit);
      await reapMemoryMcpForDb(dbPath, childPid ? [childPid] : []);
      throw error;
    }
    let ready = true;
    const bank = process.env.MURRMURE_MEMORY_PREWARM_BANK ?? "warmup";
    void client.callTool({ name: "recall", arguments: { bank, query: ".", limit: 1 } }).catch(() => undefined);
    console.log(
      `[murrmure] memory-mcp ready db=${dbPath} pid=${childPid ?? "?"}${handbook ? ` subjects=${handbook}` : ""}`,
    );
    return {
      isReady: () => ready,
      subjectsPath: () => handbook,
      subjectNames: () => handbookNames,
      async callTool(name, callArgs) {
        const raw = await client.callTool({ name, arguments: callArgs });
        return unwrapMcpToolResult(raw);
      },
      async stop() {
        ready = false;
        process.off("exit", onExit);
        const pid = childPid;
        childPid = null;
        await reapMemoryMcpForDb(dbPath, pid ? [pid] : []);
        try {
          await client.close();
        } catch {
          /* child already reaped */
        }
      },
    };
  } catch (error) {
    await reapMemoryMcpForDb(dbPath).catch(() => undefined);
    console.warn(
      `[murrmure] memory-mcp failed to start: ${error instanceof Error ? error.message : String(error)}`,
    );
    return DISABLED_MEMORY_MCP;
  }
}

export async function resolveMemoryMcp(
  config: DaemonConfig,
  subjectsPath?: string | null,
): Promise<MemoryMcpClient> {
  if (config.memoryMcp === false) return DISABLED_MEMORY_MCP;
  if (config.memoryMcp) return config.memoryMcp;
  if (!shouldStartMemoryMcp(config)) return DISABLED_MEMORY_MCP;
  return startStdioMemoryMcp(config, subjectsPath);
}
