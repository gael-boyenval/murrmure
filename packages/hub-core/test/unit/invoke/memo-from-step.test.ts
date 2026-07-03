import { describe, expect, test } from "vitest";
import { dispatchOutcomeFromStepMemo } from "../../../src/invoke/memo-from-step.js";

describe("invoke/memo-from-step", () => {
  test("maps completed step memo to dispatch outcome", () => {
    const outcome = dispatchOutcomeFromStepMemo({
      run_id: "run_01ABC",
      step_id: "action:ping",
      status: "completed",
      idempotency_key: "idem:run_01ABC:action:ping",
    });
    expect(outcome).toEqual({
      status: "completed",
      run_id: "run_01ABC",
      step_id: "action:ping",
      error_code: undefined,
    });
  });

  test("returns null for pending step memo", () => {
    expect(
      dispatchOutcomeFromStepMemo({
        run_id: "run_01ABC",
        step_id: "action:ping",
        status: "pending",
      }),
    ).toBeNull();
  });
});
