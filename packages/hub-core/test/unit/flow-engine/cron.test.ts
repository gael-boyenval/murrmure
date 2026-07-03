import { describe, expect, test } from "vitest";
import { cronMatches, dueScheduledFlows } from "../../../src/flow-engine/cron.js";

describe("flow-engine/cron", () => {
  test("matches daily 9am cron", () => {
    const nineAm = new Date("2026-06-30T09:00:00");
    expect(cronMatches("0 9 * * *", nineAm)).toBe(true);
    const tenAm = new Date("2026-06-30T10:00:00");
    expect(cronMatches("0 9 * * *", tenAm)).toBe(false);
  });

  test("dueScheduledFlows returns matching flow ids", () => {
    const date = new Date("2026-06-30T09:00:00");
    const due = dueScheduledFlows(
      [
        { flow_id: "flw_a", schedule: "0 9 * * *" },
        { flow_id: "flw_b", schedule: null },
        { flow_id: "flw_c", schedule: "0 10 * * *" },
      ],
      date,
    );
    expect(due).toEqual(["flw_a"]);
  });
});

describe("http/flows/run-schedule", () => {
  test("schedule tick helper selects due flows", () => {
    const date = new Date("2026-06-30T09:00:00");
    expect(
      dueScheduledFlows([{ flow_id: "flw_daily", schedule: "0 9 * * *" }], date),
    ).toContain("flw_daily");
  });
});
