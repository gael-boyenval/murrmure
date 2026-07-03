// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { GateResolvePanel } from "./GateResolvePanel.js";
import type { GateItem } from "@murrmure/shell-client";

afterEach(() => cleanup());

const gate: GateItem = {
  gate_id: "chk_test",
  run_id: "run_c1d4e5",
  session_id: "ses_review_loop",
  step_id: "gate:review",
  status: "pending",
  title: "Review loop — human approval needed",
  summary: "Agent completed draft, waiting for your decision.",
  created_at: "2026-07-01T09:30:00Z",
  space_label: "Demo space",
  space_link: "/spaces/spc_demo",
  form: {
    id: "review.v1",
    fields: [
      { name: "decision", type: "enum", values: ["approve", "reject"] },
      { name: "notes", type: "string", required: false },
    ],
  },
};

const ORCHESTRATION_APPROVE_CONSEQUENCE =
  "Approving binds this orchestration to the session and enqueues the proposed steps.";

function renderPanel(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("GateResolvePanel", () => {
  it("renders gate header context", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T10:00:00Z"));
    try {
      renderPanel(<GateResolvePanel gate={gate} onSubmit={vi.fn()} />);

      expect(screen.getByText("Review loop — human approval needed")).toBeTruthy();
      expect(screen.getByText("Agent completed draft, waiting for your decision.")).toBeTruthy();
      expect(screen.getByText("gate:review")).toBeTruthy();
      expect(screen.getByText("Pending")).toBeTruthy();
      expect(screen.getByText("30m")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Demo space" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "run_c1d4e5" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "ses_revi…" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows private space label without link when space is hidden", () => {
    renderPanel(
      <GateResolvePanel
        gate={{ ...gate, space_hidden: true, space_label: "Private space", space_link: undefined }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Private space")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Private space" })).toBeNull();
  });

  it("shows approveConsequence callout before Approve and links it via aria-describedby", () => {
    const { container } = renderPanel(
      <GateResolvePanel gate={gate} onSubmit={vi.fn()} approveConsequence={ORCHESTRATION_APPROVE_CONSEQUENCE} />,
    );

    const callout = screen.getByText(ORCHESTRATION_APPROVE_CONSEQUENCE);
    const approve = screen.getByRole("button", { name: "Approve" });

    expect(callout).toBeTruthy();
    expect(callout.getAttribute("id")).toBe("gate-resolve-approve-consequence");
    expect(approve.getAttribute("aria-describedby")).toBe("gate-resolve-approve-consequence");

    const calloutIndex = Array.from(container.querySelectorAll("p, button")).indexOf(callout);
    const approveIndex = Array.from(container.querySelectorAll("p, button")).indexOf(approve);
    expect(calloutIndex).toBeGreaterThanOrEqual(0);
    expect(approveIndex).toBeGreaterThan(calloutIndex);
  });

  it("submits approve with form values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderPanel(<GateResolvePanel gate={gate} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "LGTM" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        decision: "approved",
        form_values: { notes: "LGTM", decision: "approve" },
      });
    });
  });

  it("shows loading spinner and aria-busy on Approve when submitting", () => {
    renderPanel(<GateResolvePanel gate={gate} onSubmit={vi.fn()} submitting />);

    const approve = screen.getByRole("button", { name: "Approve" });
    const reject = screen.getByRole("button", { name: "Reject" });

    expect(approve.getAttribute("aria-busy")).toBe("true");
    expect(approve).toHaveProperty("disabled", true);
    expect(reject.getAttribute("aria-busy")).toBeNull();
    expect(reject).toHaveProperty("disabled", true);
  });
});
