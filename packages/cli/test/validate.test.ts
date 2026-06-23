import { describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildFlowRoot,
  initFlow,
  validateFlowRoot,
  LegacyFlowManifestSchema,
} from "../src/flow-commands.js";
import { linkScaffoldWorkspaceDeps } from "./helpers/link-scaffold-deps.js";

describe("murrmure-cli", () => {
  test("init emits strict react scaffold with exact pins", () => {
    const base = mkdtempSync(join(tmpdir(), "mrmr-"));
    const dir = join(base, "demo-flow");
    try {
      initFlow("demo-flow", dir);
      expect(existsSync(join(dir, "ui", "src", "App.tsx"))).toBe(true);
      expect(existsSync(join(dir, "ui", "src", "mount.tsx"))).toBe(true);
      expect(
        existsSync(join(dir, "ui", "src", "components", "error", "FlowErrorBoundary.tsx")),
      ).toBe(true);
      expect(
        existsSync(join(dir, "ui", "src", "components", "error", "FlowErrorState.tsx")),
      ).toBe(true);
      expect(existsSync(join(dir, "playwright.config.ts"))).toBe(true);

      const packageJson = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
        scripts: Record<string, string>;
      };

      expect(packageJson.dependencies["@murrmure/flow-dev-kit"]).toBe("0.1.0");
      expect(packageJson.dependencies.react).toBe("18.3.1");
      expect(packageJson.dependencies["react-dom"]).toBe("18.3.1");
      expect(packageJson.devDependencies["@murrmure/cli"]).toBe("0.1.0");
      expect(packageJson.devDependencies.typescript).toBe("5.6.3");
      expect(packageJson.devDependencies.vitest).toBe("3.2.4");
      expect(packageJson.scripts["validate:flow"]).toBe("mrmr flow validate .");
      expect(packageJson.scripts["build:flow"]).toBe("mrmr flow build .");
      expect(packageJson.scripts["dev:flow"]).toBe("mrmr flow dev . --sim");
      expect(packageJson.scripts["test:unit"]).toBe("vitest run");
      expect(packageJson.scripts["test:e2e"]).toBe("playwright test");

      const result = validateFlowRoot(dir);
      expect(result.ok).toBe(true);
      expect(result.manifest?.id).toBe("demo-flow");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("build stages bundle with digest and source archive", async () => {
    const base = mkdtempSync(join(tmpdir(), "mrmr-build-"));
    const dir = join(base, "demo-build");
    try {
      initFlow("demo-build", dir);
      linkScaffoldWorkspaceDeps(dir);
      const built = await buildFlowRoot(dir, { outDir: join(dir, "stage") });
      expect(built.ok, JSON.stringify(built.errors)).toBe(true);
      expect(built.bundleDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(built.sourceDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(existsSync(join(dir, "stage", "bundle.tar.zst"))).toBe(true);
      expect(existsSync(join(dir, "stage", "source.tar.zst"))).toBe(true);
      expect(existsSync(join(dir, "stage", "source", "flow.manifest.json"))).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("validate fails when dev kit dependency is missing", () => {
    const base = mkdtempSync(join(tmpdir(), "mrmr-policy-missing-"));
    const dir = join(base, "demo-policy");
    try {
      initFlow("demo-policy", dir);
      const packageJsonPath = join(dir, "package.json");
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        dependencies: Record<string, string>;
      };
      delete packageJson.dependencies["@murrmure/flow-dev-kit"];
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      const result = validateFlowRoot(dir);
      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.code === "DEVKIT_VERSION_REQUIRED")).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("validate fails when required dependencies are not exact", () => {
    const base = mkdtempSync(join(tmpdir(), "mrmr-policy-exact-"));
    const dir = join(base, "demo-policy-exact");
    try {
      initFlow("demo-policy-exact", dir);
      const packageJsonPath = join(dir, "package.json");
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        dependencies: Record<string, string>;
      };
      packageJson.dependencies.react = "^18.3.1";
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      const result = validateFlowRoot(dir);
      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.code === "DEVKIT_VERSION_NOT_EXACT")).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("validate fails on sdk/dev-kit version mismatch", () => {
    const base = mkdtempSync(join(tmpdir(), "mrmr-policy-mismatch-"));
    const dir = join(base, "demo-policy-mismatch");
    try {
      initFlow("demo-policy-mismatch", dir);
      const packageJsonPath = join(dir, "package.json");
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        devDependencies: Record<string, string>;
      };
      packageJson.devDependencies["@murrmure/cli"] = "0.2.0";
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      const result = validateFlowRoot(dir);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some((error) => error.code === "DEVKIT_CLI_VERSION_MISMATCH"),
      ).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("legacy P5 manifest warns", () => {
    const legacy = LegacyFlowManifestSchema.parse({
      id: "review",
      version: "0.1.0",
      contract_ref_id: "cref_review_loop",
      routes_prefix: "/api/sessions",
      mcp_tools: ["create_review_session"],
      mount_export: "@murrmure/invalid/mount",
    });
    expect(legacy.id).toBe("review");
  });
});
