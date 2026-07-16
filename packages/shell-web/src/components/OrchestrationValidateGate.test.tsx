// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OrchestrationValidateGate } from "./OrchestrationValidateGate.js";
import type { GateItem } from "@murrmure/shell-client";

const gate: GateItem = {
  gate_id: "gate_orch",
  run_id: "run_orch",
  session_id: "ses_orch",
  step_id: "orchestration:proposed",
  status: "pending",
  form: {
    id: "orchestration.validate.v1",
    fields: [
      { name: "decision", type: "enum", values: ["approve", "reject"] },
      { name: "notes", type: "string" },
    ],
  },
  orchestration_preview: {
    manifest_name: "agent-proposed",
    flow_digest: "sha256:preview",
    steps: [
      {
        step_id: "plan",
        space: "spc_demo",
        action: "plan",
        param_shape: { api_key: "string", count: "number" },
      },
    ],
  },
};

describe("OrchestrationValidateGate", () => {
  it("shows param shapes without secret values and submits approve", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<OrchestrationValidateGate gate={gate} onSubmit={onSubmit} />);

    expect(screen.getByText(/agent-proposed/)).toBeTruthy();
    expect(screen.getByText(/api_key: string/)).toBeTruthy();
    expect(screen.getByText(/count: number/)).toBeTruthy();
    expect(screen.queryByText(/super-secret/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        decision: "approved",
        form_values: { decision: "approve" },
      });
    });
  });
});
