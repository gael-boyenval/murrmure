import { describe, expect, test } from "vitest";
import { collectFlowStartEvents, parseHookRow } from "../../../src/flow-engine/space-home-index.js";

describe("space-home-index", () => {
  test("parseHookRow supports source arrays", () => {
    const hook = parseHookRow({
      name: "on-dev-failure",
      on: {
        event: {
          type: "murrmure.feedback.failure",
          source: ["/spaces/spc_my_space", "/spaces/spc_dev"],
        },
      },
      do: [{ invoke: { action: "write_failure_feedback" } }],
    });

    expect(hook).toEqual({
      hook_id: "on-dev-failure",
      event_type: "murrmure.feedback.failure",
      source: ["/spaces/spc_my_space", "/spaces/spc_dev"],
      actions: [{ kind: "invoke", label: "write_failure_feedback" }],
    });
  });

  test("collectFlowStartEvents reads flow start.events", () => {
    const events = collectFlowStartEvents([
      {
        flow_id: "flw_daily",
        origin_space_id: "spc_demo",
        digest: "sha256:x",
        name: "daily",
        start: {
          manual: false,
          events: [{ type: "brief.requested", source: "/spaces/spc_demo" }],
        },
        step_spaces: ["spc_demo"],
        grants_required: [],
        ir: {} as never,
      },
    ]);

    expect(events).toEqual([
      {
        event_type: "brief.requested",
        kind: "flow_start",
        flow_id: "flw_daily",
        source: "/spaces/spc_demo",
      },
    ]);
  });
});
