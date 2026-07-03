import { describe, expect, test } from "vitest";
import { hookSourceMatches, matchHooks } from "../../../src/hooks/matcher.js";

describe("hook matcher", () => {
  test("matches when source filter is absent", () => {
    const matched = matchHooks(
      [{ name: "on-failure", on: { event: { type: "murrmure.feedback.failure" } }, do: [{ ensure_session: { title: "t" } }] }],
      {
        event_id: "evt_1",
        event_type: "murrmure.feedback.failure",
        space_id: "spc_my_space",
        source: "/spaces/spc_my_space",
        payload: {},
      },
    );
    expect(matched).toHaveLength(1);
  });

  test("matches when source filter is a string", () => {
    expect(hookSourceMatches("/spaces/spc_my_space", "/spaces/spc_my_space")).toBe(true);
    expect(hookSourceMatches("/spaces/spc_other", "/spaces/spc_my_space")).toBe(false);
  });

  test("matches when source filter is an array", () => {
    const sources = ["/spaces/spc_my_space", "/spaces/spc_other"];
    expect(hookSourceMatches(sources, "/spaces/spc_my_space")).toBe(true);
    expect(hookSourceMatches(sources, "/spaces/spc_other")).toBe(true);
    expect(hookSourceMatches(sources, "/spaces/spc_unknown")).toBe(false);

    const matched = matchHooks(
      [
        {
          name: "on-dev-failure",
          on: {
            event: {
              type: "murrmure.feedback.failure",
              source: ["/spaces/spc_my_space", "/spaces/spc_dev"],
            },
          },
          do: [{ ensure_session: { title: "Feedback" } }],
        },
      ],
      {
        event_id: "evt_2",
        event_type: "murrmure.feedback.failure",
        space_id: "spc_dev",
        source: "/spaces/spc_dev",
        payload: {},
      },
    );
    expect(matched).toHaveLength(1);
  });
});
