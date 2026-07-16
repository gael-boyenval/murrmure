import { describe, expect, test } from "vitest";
import {
  parseBindingsFile,
  resolveBindingsFile,
  resolveBindingSource,
} from "../../../src/index/parse-bindings.js";

describe("index/parse-bindings", () => {
  test("parses and resolves local/space/catalog binding sources", () => {
    const parsed = parseBindingsFile({
      version: 1,
      flows: [
        { ref: "flw_preview_review", source: "space:spc_catalog" },
        { ref: "flw_daily_brief", source: "catalog" },
      ],
      views: [{ ref: "preview-review-intake", source: "local:views/preview-review-intake" }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const resolved = resolveBindingsFile(parsed.value);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    expect(resolved.value.flows[0]?.source).toEqual({
      kind: "space",
      space_id: "spc_catalog",
    });
    expect(resolved.value.flows[1]?.source).toEqual({ kind: "catalog" });
    expect(resolved.value.views[0]?.source).toEqual({
      kind: "local",
      path: "views/preview-review-intake",
    });
  });

  test("rejects unsupported binding source prefixes", () => {
    const source = resolveBindingSource("npm:@murrmure/flow");
    expect(source.ok).toBe(false);
    if (source.ok) return;
    expect(source.code).toBe("INVALID_BINDINGS_SOURCE");
  });
});
