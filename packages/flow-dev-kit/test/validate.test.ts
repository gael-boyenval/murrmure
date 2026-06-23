import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FlowManifestSchema } from "../src/schema.js";
import { validateFlowRoot, validateManifest } from "../src/validate.js";

describe("@murrmure/flow-dev-kit validate", () => {
  test("validateManifest parses flow manifest", () => {
    const manifest = validateManifest({
      schemaVersion: "1",
      id: "demo-flow",
      version: "0.1.0",
      routes_prefix: "/api/demo-flow",
      ui: { entry: "ui/entry.js", canvas_route: "/canvas/demo-flow" },
      server: { mount_module: "server/mount.mjs" },
      mcp_tools_by_version: { "0.1.0": ["ping"] },
    });
    expect(FlowManifestSchema.parse(manifest).id).toBe("demo-flow");
  });

  test("validateFlowRoot fails without manifest", () => {
    const base = mkdtempSync(join(tmpdir(), "fdk-validate-"));
    try {
      const result = validateFlowRoot(base);
      expect(result.ok).toBe(false);
      expect(result.errors[0]?.code).toBe("MANIFEST_INVALID");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
