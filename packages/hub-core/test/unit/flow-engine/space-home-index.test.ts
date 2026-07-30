import { describe, expect, test } from "vitest";
import {
  collectFlowStartEvents,
  parseHandlerRow,
} from "../../../src/flow-engine/space-home-index.js";

describe("space-home-index", () => {
  test("parseHandlerRow reads HandlerSpec event handlers", () => {
    const handler = parseHandlerRow({
      id: "on-dev-failure",
      description: "Handle failure feedback from my_space",
      contract_keys: [],
      on: {
        event: {
          type: "murrmure.feedback.failure",
          source: ["/spaces/spc_my_space", "/spaces/spc_dev"],
        },
      },
      type: "shell_spawn",
      complete: "auto",
      command: "echo hi",
    });

    expect(handler).toEqual({
      handler_id: "on-dev-failure",
      event_type: "murrmure.feedback.failure",
      source: ["/spaces/spc_my_space", "/spaces/spc_dev"],
      type: "shell_spawn",
      summary: "echo hi",
      description: "Handle failure feedback from my_space",
    });
  });

  test("parseHandlerRow ignores step lifecycle handlers", () => {
    expect(
      parseHandlerRow({
        id: "gate-view",
        contract_keys: [],
        on: "step.opened::demo.review",
        type: "view_resolver",
        view: "review-canvas",
      }),
    ).toBeNull();
  });

  test("parseHandlerRow still accepts legacy hook rows", () => {
    const handler = parseHandlerRow({
      name: "on-dev-failure",
      on: {
        event: {
          type: "murrmure.feedback.failure",
          source: ["/spaces/spc_my_space"],
        },
      },
      do: [{ invoke: { action: "write_failure_feedback" } }],
    });

    expect(handler).toEqual({
      handler_id: "on-dev-failure",
      event_type: "murrmure.feedback.failure",
      source: ["/spaces/spc_my_space"],
      type: "legacy_hook",
      summary: "write_failure_feedback",
    });
  });

  test("collectFlowStartEvents reads flow triggers.events", () => {
    const events = collectFlowStartEvents([
      {
        flow_id: "flw_daily",
        origin_space_id: "spc_demo",
        digest: "sha256:x",
        name: "daily",
        triggers: {
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
