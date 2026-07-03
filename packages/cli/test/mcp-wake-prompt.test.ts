import { describe, expect, test } from "vitest";
import {
  formatControlWake,
  formatInvokeActionWake,
  formatWakePendingWake,
} from "../src/mcp/wake-prompt.js";

describe("mcp/wake-prompt", () => {
  test("formatInvokeActionWake surfaces instruction from hook params", () => {
    const prompt = formatInvokeActionWake({
      action_name: "write_improvement_feedback",
      run_id: "run_01",
      session_id: "ses_01",
      step_id: "action:write_improvement_feedback",
      params: {
        instruction: "Write an improvement request under feedbacks/.",
        topic: "MCP hooks",
        summary: "Need handshake",
      },
    });

    expect(prompt).toContain("write_improvement_feedback");
    expect(prompt).toContain("Instruction:");
    expect(prompt).toContain("Write an improvement request under feedbacks/");
    expect(prompt).toContain("MCP hooks");
    expect(prompt).not.toContain("Execute this indexed action");
  });

  test("formatWakePendingWake includes label and payload", () => {
    const prompt = formatWakePendingWake({
      wake_label: "handle_spec_published",
      payload: { spec_key: "guest-checkout" },
    });

    expect(prompt).toContain("handle_spec_published");
    expect(prompt).toContain("guest-checkout");
  });

  test("formatControlWake returns null for non-wake methods", () => {
    expect(formatControlWake("murrmure/control.tools_changed", {})).toBeNull();
  });
});
