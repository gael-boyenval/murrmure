// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GateResolvePanel } from "./GateResolvePanel.js";
import type { GateItem } from "@murrmure/shell-client";

const gate: GateItem = {
  gate_id: "chk_test",
  run_id: "run_test",
  session_id: "ses_test",
  step_id: "gate:review",
  status: "pending",
  form: {
    id: "review.v1",
    fields: [
      { name: "decision", type: "enum", values: ["approve", "reject"] },
      { name: "notes", type: "string" },
    ],
  },
};

describe("GateResolvePanel", () => {
  it("submits approve with form values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GateResolvePanel gate={gate} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("notes"), { target: { value: "LGTM" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        decision: "approved",
        form_values: { notes: "LGTM", decision: "approve" },
      });
    });
  });
});
