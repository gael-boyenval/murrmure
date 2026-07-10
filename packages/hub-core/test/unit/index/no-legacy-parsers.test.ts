import { describe, expect, test } from "vitest";
import * as index from "../../../src/index/index.js";

describe("index/no-legacy-parsers", () => {
  test("does not export legacy parser or alias symbols", () => {
    const symbols = Object.keys(index);
    expect(symbols).not.toContain("parseActionsFile");
    expect(symbols).not.toContain("parseHooksFile");
    expect(symbols).not.toContain("parseExecutorsFile");
    expect(symbols).not.toContain("resolveHooksFilename");
    expect(symbols).not.toContain("isHooksResourcePath");
    expect(symbols).not.toContain("HOOKS_FILENAMES");
  });
});
