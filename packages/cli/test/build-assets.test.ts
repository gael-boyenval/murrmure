import { describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFlowRoot, initFlow } from "../src/flow-commands.js";
import { copyUiStaticAssets, validateShellAssetReferences } from "../src/ui-assets.js";
import { linkScaffoldWorkspaceDeps } from "./helpers/link-scaffold-deps.js";

describe("flow build assets", () => {
  test("copies static ui files except ui/src into stage", async () => {
    const base = mkdtempSync(join(tmpdir(), "cap-sdk-assets-"));
    const dir = join(base, "demo-assets");
    try {
      initFlow("demo-assets", dir);
      linkScaffoldWorkspaceDeps(dir);

      mkdirSync(join(dir, "ui", "crit"), { recursive: true });
      writeFileSync(join(dir, "ui", "crit", "style.css"), "body { color: red; }\n");
      writeFileSync(
        join(dir, "ui", "shell.html"),
        `<!doctype html><html><head><link rel="stylesheet" href="./crit/style.css" /></head><body><div id="root"></div></body></html>`,
      );

      const built = await buildFlowRoot(dir, { outDir: join(dir, "stage") });
      expect(built.ok, JSON.stringify(built.errors)).toBe(true);
      expect(existsSync(join(dir, "stage", "ui", "crit", "style.css"))).toBe(true);
      expect(readFileSync(join(dir, "stage", "ui", "crit", "style.css"), "utf-8")).toContain("color: red");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("fails build when shell.html references missing asset", async () => {
    const base = mkdtempSync(join(tmpdir(), "cap-sdk-assets-missing-"));
    const dir = join(base, "demo-missing");
    try {
      initFlow("demo-missing", dir);
      linkScaffoldWorkspaceDeps(dir);
      writeFileSync(
        join(dir, "ui", "shell.html"),
        `<!doctype html><html><head><link rel="stylesheet" href="./missing/style.css" /></head><body></body></html>`,
      );

      const built = await buildFlowRoot(dir, { outDir: join(dir, "stage") });
      expect(built.ok).toBe(false);
      expect(built.errors?.some((error) => error.code === "UI_ASSET_MISSING")).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("fails build when server bundle has syntax errors", async () => {
    const base = mkdtempSync(join(tmpdir(), "cap-sdk-server-fail-"));
    const dir = join(base, "demo-server-fail");
    try {
      initFlow("demo-server-fail", dir);
      linkScaffoldWorkspaceDeps(dir);
      writeFileSync(join(dir, "server", "index.ts"), "export function mountRoutes( { broken");

      const built = await buildFlowRoot(dir, { outDir: join(dir, "stage") });
      expect(built.ok).toBe(false);
      expect(built.errors?.some((error) => error.code === "SERVER_BUNDLE_FAILED")).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("copyUiStaticAssets respects explicit asset paths", () => {
    const base = mkdtempSync(join(tmpdir(), "cap-sdk-copy-"));
    const source = join(base, "source");
    const stage = join(base, "stage", "ui");
    try {
      mkdirSync(join(source, "ui", "crit"), { recursive: true });
      mkdirSync(join(source, "ui", "agent"), { recursive: true });
      writeFileSync(join(source, "ui", "crit", "a.css"), "a");
      writeFileSync(join(source, "ui", "agent", "b.js"), "b");

      copyUiStaticAssets(source, stage, ["crit/a.css"]);
      expect(existsSync(join(stage, "crit", "a.css"))).toBe(true);
      expect(existsSync(join(stage, "agent", "b.js"))).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("validateShellAssetReferences detects broken relative refs", () => {
    const base = mkdtempSync(join(tmpdir(), "cap-sdk-shell-validate-"));
    const stageUi = join(base, "ui");
    try {
      mkdirSync(stageUi, { recursive: true });
      const errors = validateShellAssetReferences(
        stageUi,
        `<html><head><script src="./entry.js"></script><link href="./missing.css" rel="stylesheet" /></head></html>`,
      );
      expect(errors.some((error) => error.hint?.file === "ui/missing.css")).toBe(true);
      expect(errors.every((error) => error.code === "UI_ASSET_MISSING")).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
