import { describe, expect, it } from "vitest";
import { parseSseMessage, JOURNAL_SSE_EVENTS } from "../src/sse.js";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";

describe("parseSseMessage", () => {
  it("parses journal.append payload", () => {
    const raw = JSON.stringify({
      type: "mrmr.run.started",
      space_id: "spc_demo",
      run_id: "run_01",
    });
    const parsed = parseSseMessage("journal.append", raw);
    expect(parsed).toEqual({
      event: "journal.append",
      data: {
        type: "mrmr.run.started",
        space_id: "spc_demo",
        run_id: "run_01",
      },
    });
  });

  it("returns null for heartbeat", () => {
    expect(parseSseMessage("heartbeat", "{}")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseSseMessage("journal.append", "not-json")).toBeNull();
  });

  it("includes space index updated in event list", () => {
    expect(JOURNAL_SSE_EVENTS).toContain(JOURNAL_EVENT_TYPES.SPACE_INDEX_UPDATED);
  });
});
