import { describe, expect, it } from "vitest";
import { nextPtyWrite } from "./seat-terminal-write.js";

describe("nextPtyWrite", () => {
  it("writes only the suffix when the stream grows", () => {
    expect(nextPtyWrite("abc", "abcdef")).toEqual({ reset: false, chunk: "def" });
  });

  it("is a no-op when the snapshot is unchanged", () => {
    expect(nextPtyWrite("abc", "abc")).toEqual({ reset: false, chunk: "" });
  });

  it("resets instead of appending when the snapshot is replaced", () => {
    expect(nextPtyWrite("old-spinner\n", "new-spinner\n")).toEqual({
      reset: true,
      chunk: "new-spinner\n",
    });
  });
});
