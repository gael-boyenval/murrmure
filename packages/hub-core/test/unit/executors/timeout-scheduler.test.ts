import { describe, expect, test, beforeEach } from "vitest";
import type { RunStepMemo, StepContractCatalog } from "@murrmure/contracts";
import {
  ExecutorTimeoutScheduler,
  humanStepPausesExecutorTimeout,
} from "../../../src/executors/timeout-scheduler.js";

const catalog: StepContractCatalog = {
  flow_id: "flw_test",
  digest: "sha256:test",
  graph_digest: "sha256:graph",
  step_ids: ["build", "build.review"],
  entries: [
    {
      step_id: "build",
      parent_id: null,
      branches: { completed: { routes: [{ engine: "advance" }] } },
    },
    {
      step_id: "build.review",
      parent_id: "build",
      branches: { validated: { routes: [{ engine: "resume", step_id: "build" }] } },
    },
  ],
};

describe("unit/executors/timeout-scheduler", () => {
  let scheduler: ExecutorTimeoutScheduler;

  beforeEach(() => {
    scheduler = new ExecutorTimeoutScheduler();
  });

  test("open nested step pauses parent executor timeout", () => {
    const t0 = 1_000_000;
    scheduler.start({
      run_id: "run_1",
      step_id: "build",
      timeout_ms: 10_000,
      now: t0,
    });

    const memosOpen: RunStepMemo[] = [
      { run_id: "run_run_1", step_id: "build.review", status: "working" },
    ];
    scheduler.syncHumanWaitPause({
      run_id: "run_1",
      catalog,
      memos: memosOpen,
      now: t0 + 5_000,
    });

    expect(scheduler.effectiveElapsedMs(scheduler.get("run_1", "build")!, t0 + 9_000)).toBe(5_000);

    scheduler.syncHumanWaitPause({
      run_id: "run_1",
      catalog,
      memos: [],
      now: t0 + 9_000,
    });
    expect(scheduler.effectiveElapsedMs(scheduler.get("run_1", "build")!, t0 + 9_000)).toBe(5_000);
    expect(scheduler.collectExpired(t0 + 9_000)).toHaveLength(0);
  });

  test("does not expire while paused for an open nested step beyond raw timeout", () => {
    const t0 = 0;
    scheduler.start({ run_id: "run_1", step_id: "build", timeout_ms: 1_000, now: t0 });
    scheduler.syncHumanWaitPause({
      run_id: "run_1",
      catalog,
      memos: [{ run_id: "run_run_1", step_id: "build.review", status: "working" }],
      now: t0 + 500,
    });
    expect(scheduler.collectExpired(t0 + 5_000)).toHaveLength(0);
  });

  test("humanStepPausesExecutorTimeout matches nested ids", () => {
    expect(humanStepPausesExecutorTimeout(catalog, "build", "build.review")).toBe(true);
    expect(humanStepPausesExecutorTimeout(catalog, "build", "review")).toBe(false);
  });
});
