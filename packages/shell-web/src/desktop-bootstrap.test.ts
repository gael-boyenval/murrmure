import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { applyDesktopBootstrapFromHash } from "./desktop-bootstrap.js";

describe("applyDesktopBootstrapFromHash", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    });
    vi.stubGlobal("location", {
      origin: "http://127.0.0.1:8787",
      hash: "",
      replace: vi.fn(),
    });
    vi.stubGlobal("history", {
      replaceState: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("stores token and redirects to spaces/new when bundled", () => {
    (globalThis.location as { hash: string }).hash =
      "#murrmure-bootstrap=tok_01JBOOTSTRAPTOKEN00000001";

    applyDesktopBootstrapFromHash({ bundled: true });

    expect(storage.get("murrmure_token")).toBe("tok_01JBOOTSTRAPTOKEN00000001");
    expect(storage.get("murrmure_hub_url")).toBe("http://127.0.0.1:8787");
    expect(globalThis.location.replace).toHaveBeenCalledWith("/spaces/new");
  });
});
