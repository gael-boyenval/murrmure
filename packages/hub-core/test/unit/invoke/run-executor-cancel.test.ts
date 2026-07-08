import { describe, expect, test, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import {
  cancelRunExecutors,
  clearRunExecutorCancelRegistry,
  registerRunExecutorCancel,
  registerShellProcessCancel,
} from "../../../src/invoke/run-executor-cancel.js";

describe("unit/invoke/run-executor-cancel", () => {
  beforeEach(() => {
    clearRunExecutorCancelRegistry();
  });

  test("cancelRunExecutors invokes registered handles", () => {
    let cancelled = 0;
    registerRunExecutorCancel("run_abc", { cancel: () => { cancelled += 1; } });
    expect(cancelRunExecutors("run_abc")).toBe(1);
    expect(cancelled).toBe(1);
    expect(cancelRunExecutors("run_abc")).toBe(0);
  });

  test("registerShellProcessCancel sends SIGTERM to live child", () => {
    const child = new EventEmitter() as EventEmitter & {
      kill: (signal?: string) => void;
      exitCode: number | null;
      signalCode: string | null;
    };
    child.exitCode = null;
    child.signalCode = null;
    let signal: string | undefined;
    child.kill = (s?: string) => {
      signal = s;
    };

    registerShellProcessCancel("run_shell", child);
    cancelRunExecutors("run_shell");
    expect(signal).toBe("SIGTERM");
  });
});
