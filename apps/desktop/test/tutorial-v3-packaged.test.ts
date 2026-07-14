import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import desktopConfig from "../electrobun.config.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const SHELL_SRC = join(REPO_ROOT, "packages/shell-web/src");

describe("Tutorial v3 packaged Desktop conformance", () => {
  test("Task 01 — packaged Desktop boots with no seeded spaces", () => {
    const copy = desktopConfig.build?.copy ?? {};
    expect(Object.keys(copy)).not.toContain("../../fixtures/hub/contracts");
    expect(Object.values(copy)).not.toContain("Resources/hub/contracts");
  });

  test("Task 04 — packaged shell ships the hardened view host without fallback forms", () => {
    // The packaged Desktop shell is the shell-web bundle; the hardened view host
    // (sandbox allow-scripts + CSP + nonce-bound postMessage) ships inside it.
    expect(desktopConfig.build?.copy).toMatchObject({
      "../../packages/shell-web/dist": "Resources/shell/dist",
    });

    // The deleted built-in fallback forms/routes are absent from shell source, so
    // they cannot be bundled into the packaged shell.
    for (const name of ["ViewDrawer", "ViewParamForm", "ReviewParamsView"]) {
      expect(
        existsSync(join(SHELL_SRC, "components", `${name}.tsx`)),
        `${name}.tsx should be removed`,
      ).toBe(false);
    }

    // SpaceHomePage no longer opens a fallback drawer or reads flow-level view_ref.
    const spaceHome = readFileSync(join(SHELL_SRC, "routes/SpaceHomePage.tsx"), "utf8");
    expect(spaceHome).not.toMatch(/ViewDrawer|view_ref|requires_view/);

    // The hardened host iframe uses the opaque-origin sandbox (allow-scripts only,
    // no allow-same-origin); the host-bridge addresses the opaque origin via "*".
    const hostFrame = readFileSync(
      join(REPO_ROOT, "packages/view-sdk/src/ViewHostFrame.tsx"),
      "utf8",
    );
    expect(hostFrame).toContain('sandbox="allow-scripts"');
    expect(hostFrame).not.toContain("allow-same-origin");
    const hostBridge = readFileSync(
      join(REPO_ROOT, "packages/view-sdk/src/host-bridge.ts"),
      "utf8",
    );
    expect(hostBridge).toContain('isSandboxedOpaqueOrigin');
  });

  test.skip("Task 02 — stable launcher discovers the relocated bundled bridge", () => {});
  test.skip("Task 14 — Parts 1–6 execute through packaged Desktop", () => {});
});
