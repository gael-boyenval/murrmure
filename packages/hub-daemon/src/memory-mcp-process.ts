import { execFileSync } from "node:child_process";

/** Substring that identifies a Hub-spawned memory child (`bun …/memory/src/mcp/index.ts`). */
export const MEMORY_MCP_ENTRY_MARKER = "memory/src/mcp/index.ts";

export type ProcessRow = {
  pid: number;
  ppid: number;
  args: string;
};

export type KillFn = (pid: number, signal: NodeJS.Signals | 0) => void;

const DEFAULT_GRACE_MS = 200;

export function parsePsTable(output: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    if (!Number.isFinite(pid) || !Number.isFinite(ppid) || pid <= 0) continue;
    rows.push({ pid, ppid, args: match[3] });
  }
  return rows;
}

export function isMemoryMcpArgs(args: string, dbPath?: string): boolean {
  if (!args.includes(MEMORY_MCP_ENTRY_MARKER)) return false;
  if (!dbPath) return true;
  return args.includes(`--db ${dbPath}`) || args.includes(`--db=${dbPath}`);
}

export function memoryMcpPids(rows: ProcessRow[], dbPath?: string): number[] {
  return rows.filter((row) => isMemoryMcpArgs(row.args, dbPath)).map((row) => row.pid);
}

export function readProcessTable(): ProcessRow[] {
  const output = execFileSync("ps", ["-Ao", "pid=,ppid=,args="], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return parsePsTable(output);
}

export function isPidAlive(pid: number, kill: KillFn = process.kill): boolean {
  try {
    kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function signalPids(pids: number[], signal: NodeJS.Signals, kill: KillFn = process.kill): void {
  for (const pid of pids) {
    if (pid <= 0 || pid === process.pid) continue;
    try {
      kill(pid, signal);
    } catch {
      // Already gone or not permitted.
    }
  }
}

export async function reapMemoryMcpPids(
  pids: number[],
  options: {
    graceMs?: number;
    kill?: KillFn;
    isAlive?: (pid: number) => boolean;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<void> {
  const unique = [...new Set(pids)].filter((pid) => pid > 0 && pid !== process.pid);
  if (unique.length === 0) return;

  const kill = options.kill ?? process.kill;
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const alive = options.isAlive ?? ((pid) => isPidAlive(pid, kill));

  signalPids(unique, "SIGTERM", kill);
  await sleep(graceMs);
  signalPids(unique.filter(alive), "SIGKILL", kill);
}

export async function reapMemoryMcpForDb(
  dbPath: string,
  extraPids: number[] = [],
  options?: Parameters<typeof reapMemoryMcpPids>[1] & { list?: () => ProcessRow[] },
): Promise<number[]> {
  const list = options?.list ?? readProcessTable;
  let discovered: number[] = [];
  try {
    discovered = memoryMcpPids(list(), dbPath);
  } catch {
    discovered = [];
  }
  const pids = [...new Set([...extraPids, ...discovered])];
  await reapMemoryMcpPids(pids, options);
  return pids;
}
