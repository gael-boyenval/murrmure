import { describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildCapabilityRoot,
  initCapability,
  validateCapabilityRoot,
  LegacyCapabilityManifestSchema,
} from "../src/index.js";
import { linkScaffoldWorkspaceDeps } from "./helpers/link-scaffold-deps.js";

describe("capability-sdk", () => {
  test("init emits strict react scaffold with exact pins", () => {
    const base = mkdtempSync(join(tmpdir(), "cap-sdk-"));
    const dir = join(base, "demo-flow");
    try {
      initCapability("demo-flow", dir);
      expect(existsSync(join(dir, "ui", "src", "App.tsx"))).toBe(true);
      expect(existsSync(join(dir, "ui", "src", "mount.tsx"))).toBe(true);
      expect(
        existsSync(join(dir, "ui", "src", "components", "error", "CapabilityErrorBoundary.tsx")),
      ).toBe(true);
      expect(
        existsSync(join(dir, "ui", "src", "components", "error", "CapabilityErrorState.tsx")),
      ).toBe(true);
      expect(existsSync(join(dir, "playwright.config.ts"))).toBe(true);

      const packageJson = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
        scripts: Record<string, string>;
      };

      expect(packageJson.dependencies["@studio/capability-dev-kit"]).toBe("0.1.0");
      expect(packageJson.dependencies.react).toBe("18.3.1");
      expect(packageJson.dependencies["react-dom"]).toBe("18.3.1");
      expect(packageJson.devDependencies["@studio/capability-sdk"]).toBe("0.1.0");
      expect(packageJson.devDependencies.typescript).toBe("5.6.3");
      expect(packageJson.devDependencies.vitest).toBe("3.2.4");
      expect(packageJson.scripts["validate:capability"]).toBe("studio capability validate .");
      expect(packageJson.scripts["build:capability"]).toBe("studio capability build .");
      expect(packageJson.scripts["dev:capability"]).toBe("studio capability dev . --sim");
      expect(packageJson.scripts["test:unit"]).toBe("vitest run");
      expect(packageJson.scripts["test:e2e"]).toBe("playwright test");

      const result = validateCapabilityRoot(dir);
      expect(result.ok).toBe(true);
      expect(result.manifest?.id).toBe("demo-flow");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("build stages bundle with digest", async () => {
    const base = mkdtempSync(join(tmpdir(), "cap-sdk-build-"));
    const dir = join(base, "demo-build");
    try {
      initCapability("demo-build", dir);
      linkScaffoldWorkspaceDeps(dir);
      const built = await buildCapabilityRoot(dir, { outDir: join(dir, "stage") });
      expect(built.ok).toBe(true);
      expect(built.bundleDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("validate fails when dev kit dependency is missing", () => {
    const base = mkdtempSync(join(tmpdir(), "cap-sdk-policy-missing-"));
    const dir = join(base, "demo-policy");
    try {
      initCapability("demo-policy", dir);
      const packageJsonPath = join(dir, "package.json");
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        dependencies: Record<string, string>;
      };
      delete packageJson.dependencies["@studio/capability-dev-kit"];
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      const result = validateCapabilityRoot(dir);
      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.code === "DEVKIT_VERSION_REQUIRED")).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("validate fails when required dependencies are not exact", () => {
    const base = mkdtempSync(join(tmpdir(), "cap-sdk-policy-exact-"));
    const dir = join(base, "demo-policy-exact");
    try {
      initCapability("demo-policy-exact", dir);
      const packageJsonPath = join(dir, "package.json");
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        dependencies: Record<string, string>;
      };
      packageJson.dependencies.react = "^18.3.1";
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      const result = validateCapabilityRoot(dir);
      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.code === "DEVKIT_VERSION_NOT_EXACT")).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("validate fails on sdk/dev-kit version mismatch", () => {
    const base = mkdtempSync(join(tmpdir(), "cap-sdk-policy-mismatch-"));
    const dir = join(base, "demo-policy-mismatch");
    try {
      initCapability("demo-policy-mismatch", dir);
      const packageJsonPath = join(dir, "package.json");
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        devDependencies: Record<string, string>;
      };
      packageJson.devDependencies["@studio/capability-sdk"] = "0.2.0";
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      const result = validateCapabilityRoot(dir);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some((error) => error.code === "DEVKIT_SDK_VERSION_MISMATCH"),
      ).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("legacy P5 manifest warns", () => {
    const legacy = LegacyCapabilityManifestSchema.parse({
      id: "review",
      version: "0.1.0",
      contract_ref_id: "cref_review_loop",
      routes_prefix: "/api/sessions",
      mcp_tools: ["create_review_session"],
      mount_export: "@studio/review-core/mount",
    });
    expect(legacy.id).toBe("review");
  });
});
