import { describe, expect, test, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import {
  awaitAllShellExecutorsTerminated,
  cancelRunExecutors,
  cancelStepExecutor,
  cancelAllShellExecutors,
  clearRunExecutorCancelRegistry,
  registerRunExecutorCancel,
  registerShellProcessCancel,
  terminateRunExecutors,
} from "../../../src/invoke/run-executor-cancel.js";
import { defaultExecutorTimeoutScheduler } from "../../../src/executors/timeout-scheduler.js";

function handle(cancel: () => void) {
  return { cancel, awaitTermination: () => Promise.resolve() };
}

describe("unit/invoke/run-executor-cancel", () => {
  beforeEach(() => {
    clearRunExecutorCancelRegistry();
    defaultExecutorTimeoutScheduler.clear();
  });

  test("cancelRunExecutors invokes registered handles", () => {
    const cancel = vi.fn();
    registerRunExecutorCancel("run_abc:write_spec", handle(cancel));
    expect(cancelRunExecutors("run_abc")).toBe(1);
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancelRunExecutors("run_abc")).toBe(0);
  });

  test("cancelStepExecutor only kills matching step", () => {
    const build = vi.fn();
    const archive = vi.fn();
    registerRunExecutorCancel("run_abc:build", handle(build));
    registerRunExecutorCancel("run_abc:archive", handle(archive));
    expect(cancelStepExecutor("run_abc", "build")).toBe(1);
    expect(build).toHaveBeenCalledOnce();
    expect(archive).not.toHaveBeenCalled();
    expect(cancelRunExecutors("run_abc")).toBe(1);
    expect(archive).toHaveBeenCalledOnce();
  });

  test("registerShellProcessCancel sends SIGTERM to live child", () => {
    const kill = vi.fn();
    const child = new EventEmitter() as unknown as ChildProcess;
    (child as { pid?: number }).pid = 4242;
    (child as { exitCode: number | null }).exitCode = null;
    (child as { signalCode: string | null }).signalCode = null;
    (child as { kill: typeof kill }).kill = kill;
    // Let the leader "exit" on the next tick so the escalation timer is cleared
    // and the awaitable termination resolves without keeping the test alive.
    setTimeout(() => child.emit("close", 0), 0);

    registerShellProcessCancel("run_shell", "build", child);
    expect(cancelStepExecutor("run_shell", "build")).toBe(1);
    expect(kill).toHaveBeenCalledWith("SIGTERM");
  });

  test("terminateRunExecutors clears timeout scheduler entries", () => {
    defaultExecutorTimeoutScheduler.start({
      run_id: "run_abc",
      step_id: "build",
      timeout_ms: 60_000,
    });
    registerRunExecutorCancel("run_abc:build", handle(vi.fn()));
    terminateRunExecutors({ run_id: "run_abc", reason: "cancelled" });
    expect(defaultExecutorTimeoutScheduler.get("run_abc", "build")).toBeUndefined();
  });

  test("shutdown awaits the SIGKILL escalation before resolving", async () => {
    vi.useFakeTimers();
    const kill = vi.fn();
    const child = new EventEmitter() as unknown as ChildProcess;
    (child as { pid?: number }).pid = 7777;
    (child as { exitCode: number | null }).exitCode = null;
    (child as { signalCode: string | null }).signalCode = null;
    (child as { kill: typeof kill }).kill = kill;
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    registerShellProcessCancel("run_hang", "build", child);
    expect(cancelAllShellExecutors()).toBe(1);

    // SIGTERM is sent immediately on cancel.
    expect(kill).toHaveBeenCalledWith("SIGTERM");
    const awaited = awaitAllShellExecutorsTerminated();
    // Before the grace period elapses, shutdown is still awaiting escalation.
    await vi.advanceTimersByTimeAsync(4999);
    let resolved = false;
    awaited.then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);
    // After the grace period, the SIGKILL escalation fires and shutdown resolves.
    await vi.advanceTimersByTimeAsync(2);
    await awaited;
    expect(resolved).toBe(true);
    expect(kill).toHaveBeenCalledWith("SIGKILL");
    expect(killSpy).toHaveBeenCalledWith(-7777, "SIGKILL");
    killSpy.mockRestore();
    vi.useRealTimers();
  });

  test("termination is once-only: a repeated cancel does not re-signal", async () => {
    vi.useFakeTimers();
    const kill = vi.fn();
    const child = new EventEmitter() as unknown as ChildProcess;
    (child as { pid?: number }).pid = 8888;
    (child as { exitCode: number | null }).exitCode = null;
    (child as { signalCode: string | null }).signalCode = null;
    (child as { kill: typeof kill }).kill = kill;
    // The process group stays alive after the leader exits (a TERM-resistant
    // descendant), so the SIGKILL escalation fires once after the grace period.
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    registerShellProcessCancel("run_once", "build", child);
    expect(cancelStepExecutor("run_once", "build")).toBe(1);
    // The handle is removed from the registry after the first cancel, so a
    // run-terminal cancel finds nothing and never re-signals the tree.
    expect(cancelRunExecutors("run_once")).toBe(0);
    expect(kill).toHaveBeenCalledWith("SIGTERM");
    expect(killSpy).toHaveBeenCalledWith(-8888, "SIGTERM");

    // Leader exits on SIGTERM; the descendant keeps the group alive so the
    // escalation stays armed and fires exactly once.
    (child as { exitCode: number | null }).exitCode = 143;
    child.emit("close", 143);
    await vi.advanceTimersByTimeAsync(5000);
    await awaitAllShellExecutorsTerminated();

    const termCalls = killSpy.mock.calls.filter(
      ([p, s]) => p === -8888 && s === "SIGTERM",
    ).length;
    const killCalls = killSpy.mock.calls.filter(
      ([p, s]) => p === -8888 && s === "SIGKILL",
    ).length;
    expect(termCalls).toBe(1);
    expect(killCalls).toBe(1);
    killSpy.mockRestore();
    vi.useRealTimers();
  });

  test("SIGKILL escalation survives leader exit when a TERM-resistant descendant lives", async () => {
    vi.useFakeTimers();
    const kill = vi.fn();
    const child = new EventEmitter() as unknown as ChildProcess;
    (child as { pid?: number }).pid = 6666;
    (child as { exitCode: number | null }).exitCode = null;
    (child as { signalCode: string | null }).signalCode = null;
    (child as { kill: typeof kill }).kill = kill;
    // A TERM-resistant descendant keeps the process group alive even after the
    // leader exits on SIGTERM: the signal-0 probe succeeds, so the escalation
    // must stay armed and fire SIGKILL on the group after the grace period.
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    registerShellProcessCancel("run_desc", "build", child);
    expect(cancelAllShellExecutors()).toBe(1);
    // SIGTERM is sent immediately to the leader and the process group.
    expect(kill).toHaveBeenCalledWith("SIGTERM");
    expect(killSpy).toHaveBeenCalledWith(-6666, "SIGTERM");

    // The shell leader exits on SIGTERM while the descendant survives.
    (child as { exitCode: number | null }).exitCode = 143;
    child.emit("close", 143);

    const awaited = awaitAllShellExecutorsTerminated();
    let resolved = false;
    void awaited.then(() => { resolved = true; });
    // Before the grace period elapses, shutdown is still awaiting the escalation.
    await vi.advanceTimersByTimeAsync(4999);
    await Promise.resolve();
    expect(resolved).toBe(false);
    // After the grace period, the SIGKILL escalation fires on the group and
    // shutdown resolves — the descendant cannot outlive the daemon.
    await vi.advanceTimersByTimeAsync(2);
    await awaited;
    expect(resolved).toBe(true);
    expect(killSpy).toHaveBeenCalledWith(-6666, "SIGKILL");
    killSpy.mockRestore();
    vi.useRealTimers();
  });
});
