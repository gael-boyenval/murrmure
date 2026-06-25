import { describe, expect, it } from "vitest";
import { isBundledShell, resolveHubUrl } from "./hooks.js";

describe("isBundledShell", () => {
  it("returns true only for bundled flag", () => {
    expect(isBundledShell("1")).toBe(true);
    expect(isBundledShell("0")).toBe(false);
    expect(isBundledShell(undefined)).toBe(false);
  });
});

describe("resolveHubUrl", () => {
  it("uses window origin in bundled mode", () => {
    expect(resolveHubUrl("http://127.0.0.1:8787", true, "http://127.0.0.1:8787")).toBe(
      "http://127.0.0.1:8787",
    );
  });

  it("uses stored hub url in dev mode", () => {
    expect(resolveHubUrl("http://localhost:9000", false, "http://127.0.0.1:8787")).toBe(
      "http://localhost:9000",
    );
  });

  it("falls back to local default when no stored url", () => {
    expect(resolveHubUrl(null, false, "http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
  });
});
