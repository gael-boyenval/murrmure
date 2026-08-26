import { describe, expect, test } from "vitest";
import {
  handshakeSeqReset,
  hubInstanceChanged,
  hubInstanceKey,
  hubToolNamesChanged,
} from "../src/catalog-refresh.js";

describe("catalog-refresh", () => {
  test("detects hub seq reset after restart", () => {
    expect(handshakeSeqReset(42, 1)).toBe(true);
    expect(handshakeSeqReset(1, 2)).toBe(false);
    expect(handshakeSeqReset(0, 1)).toBe(false);
  });

  test("detects hub instance replace from discovery", () => {
    expect(hubInstanceKey({ pid: 1, started_at: "a" })).toBe("1:a");
    expect(hubInstanceChanged("1:a", "2:b")).toBe(true);
    expect(hubInstanceChanged("1:a", "1:a")).toBe(false);
    expect(hubInstanceChanged(null, "1:a")).toBe(false);
  });

  test("detects hub catalog name changes", () => {
    expect(
      hubToolNamesChanged(
        [{ name: "murrmure_space_status" }],
        ["murrmure_space_status", "murrmure_start_directive"],
      ),
    ).toBe(true);
    expect(
      hubToolNamesChanged(
        [{ name: "murrmure_start_directive" }, { name: "murrmure_space_status" }],
        ["murrmure_space_status", "murrmure_start_directive"],
      ),
    ).toBe(false);
    expect(hubToolNamesChanged([{ name: "murrmure_space_status" }], undefined)).toBe(false);
    expect(hubToolNamesChanged([{ name: "murrmure_space_status" }], [])).toBe(false);
  });
});
