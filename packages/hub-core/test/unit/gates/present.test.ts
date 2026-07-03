import { describe, expect, test } from "vitest";
import { presentGateForActor } from "@murrmure/hub-core";
import type { GateRow } from "@murrmure/hub-persistence";

describe("gates/presentGateForActor", () => {
  test("uses space_name for space_label when actor can read space", () => {
    const row: GateRow = {
      gate_id: "abc123",
      run_id: "run1",
      session_id: "ses1",
      space_id: "demo",
      step_id: "gate:review",
      status: "pending",
      resolve_mode: "any_one",
      created_at: "2026-07-01T09:30:00Z",
    };

    const presented = presentGateForActor(
      {
        gate_id: "gate_abc123",
        run_id: "run_run1",
        session_id: "ses_ses1",
        step_id: "gate:review",
        status: "pending",
        resolve_mode: "any_one",
      },
      row,
      {
        actor_id: "actor_alice",
        can_read_space: true,
        space_name: "Demo space",
      },
    );

    expect(presented.space_label).toBe("Demo space");
    expect(presented.space_link).toBe("/spaces/spc_demo");
    expect(presented.space_hidden).toBe(false);
  });

  test("falls back to space_id when space_name is omitted", () => {
    const row: GateRow = {
      gate_id: "abc123",
      run_id: "run1",
      session_id: "ses1",
      space_id: "demo",
      step_id: "gate:review",
      status: "pending",
      resolve_mode: "any_one",
      created_at: "2026-07-01T09:30:00Z",
    };

    const presented = presentGateForActor(
      {
        gate_id: "gate_abc123",
        run_id: "run_run1",
        session_id: "ses_ses1",
        step_id: "gate:review",
        status: "pending",
        resolve_mode: "any_one",
      },
      row,
      {
        actor_id: "actor_alice",
        can_read_space: true,
      },
    );

    expect(presented.space_label).toBe("spc_demo");
  });
});
