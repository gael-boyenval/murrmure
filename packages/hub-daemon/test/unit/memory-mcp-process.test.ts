import { describe, expect, test } from "vitest";
import {
  isMemoryMcpArgs,
  memoryMcpPids,
  parsePsTable,
  reapMemoryMcpForDb,
  reapMemoryMcpPids,
} from "../../src/memory-mcp-process.js";

const table = `
  100  1 bun /repo/memory/src/mcp/index.ts --db /tmp/memory.db --profile serve
  101  1 bun /repo/memory/src/mcp/index.ts --db /tmp/other.db --profile serve
  102  1 node packages/hub-daemon/src/main.ts
`;

describe("memory-mcp-process", () => {
  test("parsePsTable reads pid ppid args", () => {
    expect(parsePsTable(table)).toEqual([
      {
        pid: 100,
        ppid: 1,
        args: "bun /repo/memory/src/mcp/index.ts --db /tmp/memory.db --profile serve",
      },
      {
        pid: 101,
        ppid: 1,
        args: "bun /repo/memory/src/mcp/index.ts --db /tmp/other.db --profile serve",
      },
      { pid: 102, ppid: 1, args: "node packages/hub-daemon/src/main.ts" },
    ]);
  });

  test("isMemoryMcpArgs matches entry and optional db", () => {
    const args = "bun /repo/memory/src/mcp/index.ts --db /tmp/memory.db --profile serve";
    expect(isMemoryMcpArgs(args)).toBe(true);
    expect(isMemoryMcpArgs(args, "/tmp/memory.db")).toBe(true);
    expect(isMemoryMcpArgs(args, "/tmp/other.db")).toBe(false);
    expect(isMemoryMcpArgs("node packages/hub-daemon/src/main.ts")).toBe(false);
  });

  test("memoryMcpPids filters by db", () => {
    const rows = parsePsTable(table);
    expect(memoryMcpPids(rows)).toEqual([100, 101]);
    expect(memoryMcpPids(rows, "/tmp/memory.db")).toEqual([100]);
  });

  test("reapMemoryMcpPids TERMS then KILLs leftovers", async () => {
    const sent: Array<[number, NodeJS.Signals | 0]> = [];
    const alive = new Set([11, 12]);
    await reapMemoryMcpPids([11, 12, 11], {
      graceMs: 0,
      sleep: async () => undefined,
      kill: (pid, signal) => {
        sent.push([pid, signal]);
        if (signal === "SIGTERM" && pid === 11) alive.delete(11);
      },
      isAlive: (pid) => alive.has(pid),
    });
    expect(sent).toEqual([
      [11, "SIGTERM"],
      [12, "SIGTERM"],
      [12, "SIGKILL"],
    ]);
  });

  test("reapMemoryMcpForDb combines discovered pids with extras", async () => {
    const sent: number[] = [];
    await reapMemoryMcpForDb("/tmp/memory.db", [99], {
      graceMs: 0,
      sleep: async () => undefined,
      list: () => parsePsTable(table),
      kill: (pid) => {
        sent.push(pid);
      },
      isAlive: () => false,
    });
    expect(sent.sort((a, b) => a - b)).toEqual([99, 100]);
  });
});
