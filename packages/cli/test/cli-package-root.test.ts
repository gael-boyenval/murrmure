import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cliPackageRoot, cliResourcePath } from "../src/lib/cli-package-root.js";

describe("cliPackageRoot", () => {
  test("resolves @murrmure/cli package root from source modules", () => {
    const root = cliPackageRoot();
    expect(existsSync(join(root, "package.json"))).toBe(true);
    expect(existsSync(join(root, "templates", "space", "manifest.json"))).toBe(true);
  });

  test("cliResourcePath finds bundled templates", () => {
    const manifest = cliResourcePath("templates", "space", "manifest.json");
    expect(existsSync(manifest)).toBe(true);
  });
});
