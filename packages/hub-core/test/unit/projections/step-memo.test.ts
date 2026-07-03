import { describe, expect, test } from "vitest";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { applyStepMemoFromJournal } from "../../../src/projections/step-memo.js";

describe("unit/projections/step-memo", () => {
  test("incremental dispatch then complete", () => {
    const run_id = "run_01JSTEPMEMOTEST000001";
    const step_id = "action:daily_checkin";
    const ts1 = "2026-06-30T10:00:00.000Z";
    const ts2 = "2026-06-30T10:00:01.000Z";

    const working = applyStepMemoFromJournal(null, {
      run_id,
      step_id,
      type: JOURNAL_EVENT_TYPES.ACTION_DISPATCHED,
      ts: ts1,
    });
    expect(working?.status).toBe("working");
    expect(working?.started_at).toBe(ts1);

    const done = applyStepMemoFromJournal(working, {
      run_id,
      step_id,
      type: JOURNAL_EVENT_TYPES.ACTION_COMPLETED,
      ts: ts2,
    });
    expect(done?.status).toBe("completed");
    expect(done?.completed_at).toBe(ts2);
  });

  test("failed event sets error_code", () => {
    const memo = applyStepMemoFromJournal(null, {
      run_id: "run_01JSTEPMEMOTEST000002",
      step_id: "action:fail",
      type: JOURNAL_EVENT_TYPES.ACTION_FAILED,
      ts: "2026-06-30T10:00:00.000Z",
      error_code: "EXECUTOR_UNAVAILABLE",
    });
    expect(memo?.status).toBe("failed");
    expect(memo?.error_code).toBe("EXECUTOR_UNAVAILABLE");
  });
});
