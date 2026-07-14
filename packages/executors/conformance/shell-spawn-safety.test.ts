import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createShellSpawnExecutor } from "../src/shell-spawn.js";
import { resolveShellDispatchAudit } from "../src/shell-spawn.js";
import type { DispatchContext, InvokeRequest } from "@murrmure/runtime-contracts";

interface FakeChild {
  pid?: number;
  kill: ReturnType<typeof vi.fn>;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  unref: ReturnType<typeof vi.fn>;
}

function makeFakeChild(opts: {
  pid?: number;
  stdoutData?: string;
  closeCode?: number | null;
  neverClose?: boolean;
}): FakeChild & EventEmitter {
  const child = new EventEmitter() as unknown as FakeChild & EventEmitter;
  child.pid = opts.pid;
  child.kill = vi.fn();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.unref = vi.fn();
  (child as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (child as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  if (!opts.neverClose) {
    setTimeout(() => {
      if (opts.stdoutData) {
        (child as unknown as { stdout: EventEmitter }).stdout.emit("data", Buffer.from(opts.stdoutData));
      }
      child.emit("close", opts.closeCode ?? 0);
    }, 0);
  }
  return child;
}

function asSpawn(fn: (...args: unknown[]) => unknown) {
  return fn as unknown as typeof import("node:child_process").spawn;
}

const baseInvoke = (overrides: Partial<InvokeRequest> = {}): InvokeRequest => ({
  space_id: "spc_demo",
  action_name: "act",
  run_id: "demo",
  session_id: "ses_demo",
  step_id: "write_spec",
  params: {},
  ...overrides,
});

describe("shell-spawn process-group termination", () => {
  test("non-detached timeout sends SIGTERM to the process group and fails ACTION_TIMED_OUT", async () => {
    const child = makeFakeChild({ pid: 999999, neverClose: true });
    const killSpy = vi.spyOn(process, "kill").mockImplementation((_pid: number, _signal?: string) => {
      setTimeout(() => child.emit("close", 137), 0);
      return true;
    });
    const spawnStub = asSpawn(() => child);

    const executor = createShellSpawnExecutor({ spawn: spawnStub });
    const context: DispatchContext = {
      action: { name: "act", command: "sleep 100", timeout_ms: 50 },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: "/tmp/repo",
    };

    const outcome = await executor.dispatch(baseInvoke(), context);

    expect(outcome.status).toBe("failed");
    expect(outcome.error_code).toBe("ACTION_TIMED_OUT");
    expect(killSpy).toHaveBeenCalledWith(-999999, "SIGTERM");
    killSpy.mockRestore();
  });

  test("detached timeout reports ACTION_TIMED_OUT via onShellComplete and SIGKILLs after grace", async () => {
    vi.useFakeTimers();
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const child = makeFakeChild({ pid: 424242, neverClose: true });
    const spawnStub = asSpawn(() => child);

    let completed: { error_code?: string; status: string } | undefined;
    const executor = createShellSpawnExecutor({
      spawn: spawnStub,
      onShellComplete: async (input) => {
        completed = input.outcome as { error_code?: string; status: string };
      },
    });
    const context: DispatchContext = {
      action: { name: "act", command: "sleep 100", timeout_ms: 15 },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: "/tmp/repo",
      step_contract: {
        slice_json: "{}",
        contract_path: "/tmp/repo/.mrmr/dev/runs/run_demo/active-step-contract.json",
        workdir: "/tmp/repo/.mrmr/dev/runs/run_demo/steps/write_spec/work",
      },
    };

    const outcome = await executor.dispatch(baseInvoke(), context);
    expect(outcome.status).toBe("dispatched");
    await vi.advanceTimersByTimeAsync(15);
    expect(completed?.status).toBe("failed");
    expect(completed?.error_code).toBe("ACTION_TIMED_OUT");
    expect(killSpy).toHaveBeenCalledWith(-424242, "SIGTERM");
    await vi.advanceTimersByTimeAsync(5000);
    expect(killSpy).toHaveBeenCalledWith(-424242, "SIGKILL");
    vi.clearAllTimers();
    killSpy.mockRestore();
    vi.useRealTimers();
  });
});

describe("shell-spawn consumer-copy materialization", () => {
  let spaceRoot: string;

  beforeEach(() => {
    spaceRoot = mkdtempSync(join(tmpdir(), "murrmure-t06-"));
  });

  afterEach(() => {
    rmSync(spaceRoot, { recursive: true, force: true });
  });

  test("substitutes a verified run-scoped consumer copy path for the artifact placeholder", async () => {
    const runId = "demo";
    const producerRel = join(".mrmr", "dev", "runs", "run_demo", "steps", "intake", "spec", "spec.md");
    const producerAbs = join(spaceRoot, producerRel);
    const content = "# Demo spec\n";
    mkdirSync(join(spaceRoot, ".mrmr", "dev", "runs", "run_demo", "steps", "intake", "spec"), {
      recursive: true,
    });
    writeFileSync(producerAbs, content);
    const digest = "sha256:" + createHash("sha256").update(content).digest("hex");

    const runArtifacts = {
      intake: {
        spec: {
          slot: "spec",
          path: producerRel,
          name: "spec.md",
          digest,
          size_bytes: content.length,
        },
      },
    };

    let capturedScript: string | undefined;
    const child = makeFakeChild({ closeCode: 0, stdoutData: "{}" });
    const spawnStub = asSpawn((_binary: string, args: string[], _opts: unknown) => {
      capturedScript = args[2];
      return child;
    });

    const executor = createShellSpawnExecutor({ spawn: spawnStub });
    const context: DispatchContext = {
      action: {
        name: "write_spec_copy",
        command:
          "mkdir -p specs/current\ncp {{murrmure.step.intake.artifact.spec.path}} specs/current/spec.md",
      },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: spaceRoot,
      step_contract: {
        slice_json: "{}",
        contract_path: join(spaceRoot, ".mrmr", "dev", "runs", "run_demo", "active-step-contract.json"),
        workdir: join(spaceRoot, ".mrmr", "dev", "runs", "run_demo", "steps", "write_spec", "work"),
        run_artifacts_json: JSON.stringify(runArtifacts),
      },
    };

    const outcome = await executor.dispatch(baseInvoke({ run_id: runId }), context);
    expect(outcome.status).toBe("dispatched");

    const expectedConsumer = join(
      spaceRoot,
      ".mrmr",
      "dev",
      "runs",
      "run_demo",
      "steps",
      "write_spec",
      "inputs",
      "spec",
      "spec.md",
    );
    expect(capturedScript).toBe(
      "mkdir -p specs/current\ncp '" + expectedConsumer + "' specs/current/spec.md",
    );
  });
});

describe("shell-spawn credential redaction", () => {
  test("dispatch audit never exposes the ephemeral hub token", () => {
    const context: DispatchContext = {
      action: { name: "act", command: "cursor agent -p --force {{prompt}}", prompt: "do it" },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: "/tmp/repo",
      step_contract: {
        slice_json: "{}",
        contract_path: "/tmp/repo/.mrmr/dev/runs/run_demo/active-step-contract.json",
        workdir: "/tmp/repo/.mrmr/dev/runs/run_demo/steps/write_spec/work",
        hub_token: "tok_run_scoped_secret",
        hub_url: "http://127.0.0.1:8787",
      },
    };
    const audit = resolveShellDispatchAudit(baseInvoke(), context);
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("tok_run_scoped_secret");
    expect(audit?.command).toBe("cursor agent -p --force");
  });
});

describe("shell-spawn dispatch audit reference resolution", () => {
  function auditContext(runArtifacts: unknown, command: string): DispatchContext {
    return {
      action: { name: "write_spec_copy", command },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: "/tmp/repo",
      step_contract: {
        slice_json: "{}",
        contract_path: "/tmp/repo/.mrmr/dev/runs/run_demo/active-step-contract.json",
        workdir: "/tmp/repo/.mrmr/dev/runs/run_demo/steps/write_spec/work",
        run_artifacts_json: JSON.stringify(runArtifacts),
      },
    };
  }

  test("artifact path placeholder resolves to a transfer reference, never a local path", () => {
    const runArtifacts = {
      intake: {
        spec: {
          slot: "spec",
          path: ".mrmr/dev/runs/run_demo/steps/intake/spec/spec.md",
          name: "spec.md",
          digest: "sha256:abc",
          size_bytes: 1,
          transfer_id: "xfr_01JXTREFERENCE",
        },
      },
    };
    const audit = resolveShellDispatchAudit(
      baseInvoke(),
      auditContext(runArtifacts, "cp {{murrmure.step.intake.artifact.spec.path}} specs/current/spec.md"),
    );
    expect(audit?.command).toContain("xfr_01JXTREFERENCE");
    expect(audit?.command).toContain("specs/current/spec.md");
    expect(audit?.command).not.toContain(".mrmr/dev/runs");
  });

  test("without a transfer id the placeholder resolves to a symbolic artifact reference", () => {
    const runArtifacts = {
      intake: {
        spec: {
          slot: "spec",
          path: ".mrmr/dev/runs/run_demo/steps/intake/spec/spec.md",
          name: "spec.md",
          digest: "sha256:abc",
          size_bytes: 1,
        },
      },
    };
    const audit = resolveShellDispatchAudit(
      baseInvoke(),
      auditContext(runArtifacts, "cp {{murrmure.step.intake.artifact.spec.path}} specs/current/spec.md"),
    );
    expect(audit?.command).toContain("artifact:intake:spec");
    expect(audit?.command).not.toContain(".mrmr/dev/runs");
  });
});

describe("shell-spawn typed dispatch errors fail before spawn", () => {
  let spaceRoot: string;

  beforeEach(() => {
    spaceRoot = mkdtempSync(join(tmpdir(), "murrmure-t06-err-"));
  });

  afterEach(() => {
    rmSync(spaceRoot, { recursive: true, force: true });
  });

  function stepContract(runArtifacts: unknown): DispatchContext["step_contract"] {
    return {
      slice_json: "{}",
      contract_path: join(spaceRoot, ".mrmr", "dev", "runs", "run_demo", "active-step-contract.json"),
      workdir: join(spaceRoot, ".mrmr", "dev", "runs", "run_demo", "steps", "write_spec", "work"),
      run_artifacts_json: JSON.stringify(runArtifacts),
    };
  }

  test("missing artifact binding fails with HANDLER_BINDING_VALUE_MISSING", async () => {
    let spawnCalled = false;
    const child = makeFakeChild({ closeCode: 0, stdoutData: "{}" });
    const spawnStub = asSpawn(() => {
      spawnCalled = true;
      return child;
    });
    const executor = createShellSpawnExecutor({ spawn: spawnStub });
    const context: DispatchContext = {
      action: {
        name: "write_spec_copy",
        command: "cp {{murrmure.step.intake.artifact.spec.path}} out.md",
      },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: spaceRoot,
      step_contract: stepContract({}),
    };
    const outcome = await executor.dispatch(baseInvoke({ run_id: "demo" }), context);
    expect(outcome.status).toBe("failed");
    expect(outcome.error_code).toBe("HANDLER_BINDING_VALUE_MISSING");
    expect(spawnCalled).toBe(false);
  });

  test("symlinked artifact source fails with ARTIFACT_PATH_TRAVERSAL", async () => {
    const outside = join(spaceRoot, "outside.md");
    writeFileSync(outside, "secret");
    const slotDir = join(spaceRoot, ".mrmr", "dev", "runs", "run_demo", "steps", "intake", "spec");
    mkdirSync(slotDir, { recursive: true });
    const linkRel = ".mrmr/dev/runs/run_demo/steps/intake/spec/link.md";
    symlinkSync(outside, join(spaceRoot, linkRel));
    const runArtifacts = {
      intake: {
        spec: {
          slot: "spec",
          path: linkRel,
          name: "link.md",
          digest: "sha256:abc",
          size_bytes: 1,
        },
      },
    };

    let spawnCalled = false;
    const child = makeFakeChild({ closeCode: 0, stdoutData: "{}" });
    const spawnStub = asSpawn(() => {
      spawnCalled = true;
      return child;
    });
    const executor = createShellSpawnExecutor({ spawn: spawnStub });
    const context: DispatchContext = {
      action: {
        name: "write_spec_copy",
        command: "cp {{murrmure.step.intake.artifact.spec.path}} out.md",
      },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: spaceRoot,
      step_contract: stepContract(runArtifacts),
    };
    const outcome = await executor.dispatch(baseInvoke({ run_id: "demo" }), context);
    expect(outcome.status).toBe("failed");
    expect(outcome.error_code).toBe("ARTIFACT_PATH_TRAVERSAL");
    expect(spawnCalled).toBe(false);
  });
});
