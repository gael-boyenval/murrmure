import { describe, expect, it } from "vitest";
import { formatGatePendingDuration, resolveGateHeader, resolveGateSpaceContext } from "./gate-header.js";
import type { GateItem } from "@murrmure/shell-client";

const baseGate: GateItem = {
  gate_id: "gate_test",
  run_id: "run_c1d4e5",
  session_id: "ses_review_loop",
  step_id: "gate:review",
  status: "pending",
};

describe("gate-header", () => {
  it("formats pending duration from created_at", () => {
    const now = new Date("2026-07-01T10:00:00Z");
    expect(formatGatePendingDuration("2026-07-01T09:30:00Z", now)).toBe("30m");
    expect(formatGatePendingDuration("2026-07-01T09:59:30Z", now)).toBe("just now");
  });

  it("resolves header fields from gate fixture data", () => {
    const header = resolveGateHeader(
      {
        ...baseGate,
        title: "Review loop — human approval needed",
        summary: "Agent completed draft, waiting for your decision.",
        created_at: "2026-07-01T09:30:00Z",
        space_label: "Demo space",
        space_link: "/spaces/spc_demo",
      },
      new Date("2026-07-01T10:00:00Z"),
    );

    expect(header.title).toBe("Review loop — human approval needed");
    expect(header.summary).toBe("Agent completed draft, waiting for your decision.");
    expect(header.step_id).toBe("gate:review");
    expect(header.pending_label).toBe("30m");
    expect(header.space_label).toBe("Demo space");
    expect(header.space_link).toBe("/spaces/spc_demo");
  });

  it("applies hidden-space rules without navigation link", () => {
    const space = resolveGateSpaceContext({
      ...baseGate,
      space_hidden: true,
      space_label: "Private space",
      space_link: "/spaces/spc_secret",
    });

    expect(space).toEqual({ space_label: "Private space" });
  });

  it("derives title and summary when omitted", () => {
    const header = resolveGateHeader({
      ...baseGate,
      action_name: "draft",
    });

    expect(header.title).toBe("Approval needed: draft");
    expect(header.summary).toBe("Run blocked at draft until you approve or reject.");
  });
});
