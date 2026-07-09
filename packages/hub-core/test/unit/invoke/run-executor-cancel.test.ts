import { describe, expect, test, beforeEach, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import {
  cancelRunExecutors,
  cancelStepExecutor,
  clearRunExecutorCancelRegistry,
  registerRunExecutorCancel,
  registerShellProcessCancel,
  terminateRunExecutors,
} from "../../../src/invoke/run-executor-cancel.js";
import { defaultExecutorTimeoutScheduler } from "../../../src/executors/timeout-scheduler.js";

describe("unit/invoke/run-executor-cancel", () => {
  beforeEach(() => {
    clearRunExecutorCancelRegistry();
    defaultExecutorTimeoutScheduler.clear();
  });

  test("cancelRunExecutors invokes registered handles", () => {
    const cancel = vi.fn();
    registerRunExecutorCancel("run_abc:write_spec", { cancel });
    expect(cancelRunExecutors("run_abc")).toBe(1);
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancelRunExecutors("run_abc")).toBe(0);
  });

  test("cancelStepExecutor only kills matching step", () => {
    const build = vi.fn();
    const archive = vi.fn();
    registerRunExecutorCancel("run_abc:build", { cancel: build });
    registerRunExecutorCancel("run_abc:archive", { cancel: archive });
    expect(cancelStepExecutor("run_abc", "build")).toBe(1);
    expect(build).toHaveBeenCalledOnce();
    expect(archive).not.toHaveBeenCalled();
    expect(cancelRunExecutors("run_abc")).toBe(1);
    expect(archive).toHaveBeenCalledOnce();
  });

  test("registerShellProcessCancel sends SIGTERM to live child", () => {
    const kill = vi.fn();
    const child = {
      pid: 4242,
      exitCode: null,
      signalCode: null,
      kill,
    } as unknown as ChildProcess;

    registerShellProcessCancel("run_shell", "build", child);
    cancelStepExecutor("run_shell", "build");
    expect(kill).toHaveBeenCalledWith("SIGTERM");
  });

  test("terminateRunExecutors clears timeout scheduler entries", () => {
    defaultExecutorTimeoutScheduler.start({
      run_id: "run_abc",
      step_id: "build",
      timeout_ms: 60_000,
    });
    registerRunExecutorCancel("run_abc:build", { cancel: vi.fn() });
    terminateRunExecutors({ run_id: "run_abc", reason: "cancelled" });
    expect(defaultExecutorTimeoutScheduler.get("run_abc", "build")).toBeUndefined();
  });
});
