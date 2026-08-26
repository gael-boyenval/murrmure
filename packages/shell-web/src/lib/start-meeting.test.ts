import { describe, expect, it } from "vitest";
import {
  buildMeetingStartBody,
  parseSeatKey,
  seatKey,
  setSpaceSeats,
  spaceSelectionState,
  toggleSeat,
} from "./start-meeting.js";

describe("start-meeting helpers", () => {
  it("round-trips seat keys", () => {
    const seat = { space_id: "spc_app", persona: "designer" };
    expect(parseSeatKey(seatKey(seat))).toEqual(seat);
  });

  it("toggles a seat in the selection set", () => {
    const seat = { space_id: "spc_app", persona: "qa" };
    const once = toggleSeat(new Set(), seat);
    expect(once.has(seatKey(seat))).toBe(true);
    expect(toggleSeat(once, seat).has(seatKey(seat))).toBe(false);
  });

  it("selects and clears every persona in a space", () => {
    const selected = setSpaceSeats(new Set(), "spc_app", ["designer", "qa"], true);
    expect(spaceSelectionState(selected, "spc_app", ["designer", "qa"])).toBe(true);
    expect(spaceSelectionState(selected, "spc_app", ["designer"])).toBe(true);
    const partial = toggleSeat(selected, { space_id: "spc_app", persona: "qa" });
    expect(spaceSelectionState(partial, "spc_app", ["designer", "qa"])).toBe("indeterminate");
    const cleared = setSpaceSeats(partial, "spc_app", ["designer", "qa"], false);
    expect(spaceSelectionState(cleared, "spc_app", ["designer", "qa"])).toBe(false);
  });

  it("builds a human-chair convene body", () => {
    const selected = setSpaceSeats(new Set(), "spc_app", ["designer"], true);
    expect(
      buildMeetingStartBody({
        title: "  API shape  ",
        goal: "  Pick an approach  ",
        selected,
      }),
    ).toEqual({
      title: "API shape",
      goal: "Pick an approach",
      participants: [{ space_id: "spc_app", persona: "designer" }],
      chair: { human: true },
    });
    expect(buildMeetingStartBody({ title: "  ", goal: "", selected }).title).toBe("Meeting");
    expect(buildMeetingStartBody({ title: "  ", goal: "", selected }).goal).toBeUndefined();
  });
});
