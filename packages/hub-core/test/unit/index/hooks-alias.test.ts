import { describe, expect, test } from "vitest";
import { resolveHooksFilename, isHooksResourcePath } from "../../../src/index/hooks-alias.js";

describe("index/hooks-alias", () => {
  test("accepts hooks.yaml and triggers.yaml alias", () => {
    expect(resolveHooksFilename("hooks.yaml")).toBe("hooks.yaml");
    expect(resolveHooksFilename("triggers.yaml")).toBe("triggers.yaml");
    expect(resolveHooksFilename("actions.yaml")).toBeNull();
  });

  test("detects hooks resource paths", () => {
    expect(isHooksResourcePath("murrmure/triggers.yaml")).toBe(true);
    expect(isHooksResourcePath("murrmure/hooks.yaml")).toBe(true);
    expect(isHooksResourcePath("murrmure/actions.yaml")).toBe(false);
  });
});
