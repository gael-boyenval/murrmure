/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ProtocolGateForm } from "./ProtocolGateForm.js";

const gate = {
  gate_id: "gate_1",
  step_id: "review",
  run_id: "run_1",
  session_id: "sess_1",
  flow_id: "preview-review",
  form: {
    id: "review.v1",
    fields: [
      { name: "decision", type: "enum" as const, values: ["approve", "reject"], required: true },
      { name: "notes", type: "string" as const, required: false },
    ],
  },
};

describe("ProtocolGateForm", () => {
  test("submits approve decision", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProtocolGateForm gate={gate} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ decision: "approved" });
  });
});
