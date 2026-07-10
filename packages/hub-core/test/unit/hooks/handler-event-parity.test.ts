import { describe, expect, test } from "vitest";
import { matchHooks } from "../../../src/hooks/matcher.js";
import { matchEventHandlers } from "../../../src/index/parse-handlers.js";

describe("hooks/handler-event-parity", () => {
  test("matches on.event with same type+source parity as legacy hooks", () => {
    const event = {
      event_id: "evt_1",
      event_type: "brief.requested",
      space_id: "spc_demo",
      source: "/spaces/spc_demo",
      payload: { prompt: "write summary" },
    };

    const legacy = matchHooks(
      [
        {
          name: "on-brief",
          on: { event: { type: "brief.requested", source: ["/spaces/spc_demo"] } },
          do: [{ ensure_session: { title: "brief" } }],
        },
      ],
      event,
    );

    const handlers = matchEventHandlers(
      [
        {
          id: "on-brief",
          contract_keys: [],
          on: { event: { type: "brief.requested", source: ["/spaces/spc_demo"] } },
          type: "shell_spawn",
          complete: "explicit",
          command: "echo brief",
        },
      ],
      { event_type: event.event_type, source: event.source },
    );

    expect(legacy.map((item) => item.hook_id)).toEqual(["on-brief"]);
    expect(handlers.map((item) => item.id)).toEqual(["on-brief"]);
  });

  test("does not match when source filter differs", () => {
    const handlers = matchEventHandlers(
      [
        {
          id: "brief-other",
          contract_keys: [],
          on: { event: { type: "brief.requested", source: "/spaces/spc_other" } },
          type: "shell_spawn",
          complete: "explicit",
          command: "echo brief",
        },
      ],
      { event_type: "brief.requested", source: "/spaces/spc_demo" },
    );
    expect(handlers).toHaveLength(0);
  });
});
