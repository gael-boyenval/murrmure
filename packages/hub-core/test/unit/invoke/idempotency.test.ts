import { describe, expect, test } from "vitest";
import { buildHeadlessStepId, buildInvokeIdempotencyKey } from "../../../src/invoke/idempotency.js";

describe("invoke/idempotency", () => {
  test("headless step_id defaults to action:{name}", () => {
    expect(buildHeadlessStepId("daily_checkin")).toBe("action:daily_checkin");
    expect(buildHeadlessStepId("daily_checkin", "custom")).toBe("custom");
  });

  test("idempotency key combines header, run_id, step_id", () => {
    expect(
      buildInvokeIdempotencyKey({
        header: "idem-1",
        run_id: "run_abc",
        step_id: "step_1",
      }),
    ).toBe("idem-1:run_abc:step_1");
  });

  test("idempotency none without header returns null", () => {
    expect(
      buildInvokeIdempotencyKey({
        run_id: "run_abc",
        step_id: "step_1",
        action: { name: "x", space_id: "spc_x", executor: "shell", idempotency: "none" },
      }),
    ).toBeNull();
  });

  test("header alone still produces key with empty run segment", () => {
    expect(
      buildInvokeIdempotencyKey({
        header: "idem-only",
        step_id: "action:hello",
      }),
    ).toBe("idem-only::action:hello");
  });
});
