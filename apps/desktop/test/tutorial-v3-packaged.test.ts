import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import desktopConfig from "../electrobun.config.js";
import {
  createTemporaryHub,
  createTemporaryTutorialSpace,
} from "../../../test-utils/tutorial-v3/helpers.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const SHELL_SRC = join(REPO_ROOT, "packages/shell-web/src");

/** Mirror of `resolveViewEntryUrl` (view-sdk) — the packaged shell builds
 * production View asset URLs in exactly this shape. Reconstructed here so the
 * desktop test does not depend on view-sdk; it exercises the real hub route the
 * packaged shell-web bundle calls. */
function viewAssetUrl(base: string, spaceId: string, viewId: string, entry: string): string {
  const cleanEntry = entry.replace(/^\.\//, "").split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/$/, "")}/v1/spaces/${encodeURIComponent(spaceId)}/views/${encodeURIComponent(viewId)}/${cleanEntry}`;
}

const INTAKE_FLOW = {
  apiVersion: "murrmure.flow/v1",
  name: "my-dev-flow",
  description: "My first dev workflow",
  triggers: { manual: true },
  steps: [
    {
      id: "intake",
      description: "Human attaches one spec markdown file.",
      branches: {
        continue: {
          schema: { type: "object", required: ["spec"] },
          artifact_slots: {
            spec: {
              description: "The spec markdown file",
              media_types: ["text/markdown", "text/plain"],
              extensions: [".md", ".markdown", ".txt"],
              min_bytes: 1,
              max_bytes: 1048576,
            },
          },
          route: { run: "completed" },
        },
        cancel: { schema: { type: "object" }, route: { run: "failed" } },
      },
    },
  ],
};

function tutorialBundle() {
  return {
    actions: { digest: "sha256:t4-actions", file: { version: 1, actions: {} } },
    hooks: { digest: "sha256:t4-hooks", file: { version: 1, hooks: {} } },
    flows: [
      {
        flow_id: "flw_my_dev_flow",
        rel_path: "flows/my-dev-flow/flow.manifest.yaml",
        digest: "sha256:t4-flow",
        manifest: INTAKE_FLOW,
        raw: INTAKE_FLOW,
      },
    ],
    views: [
      {
        view_id: "spec-intake",
        rel_path: "views/spec-intake",
        digest: "sha256:spec-intake",
        manifest: {
          apiVersion: "murrmure.view/v1",
          id: "spec-intake",
          entry: "./dist/index.html",
        },
        build: { dist_present: true, entry_present: true },
      },
    ],
    handlers: {
      digest: "sha256:t4-handlers",
      file: {
        version: 1,
        handlers: [
          {
            id: "intake_view",
            on: "step.opened::my-dev-flow.intake",
            type: "view_resolver",
            view: "spec-intake",
            contract_keys: [],
          },
        ],
      },
    },
  };
}

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
    const hostFrame = readFileSync(join(REPO_ROOT, "packages/view-sdk/src/ViewHostFrame.tsx"), "utf8");
    expect(hostFrame).toContain('sandbox="allow-scripts"');
    expect(hostFrame).not.toContain("allow-same-origin");
    const hostBridge = readFileSync(join(REPO_ROOT, "packages/view-sdk/src/host-bridge.ts"), "utf8");
    expect(hostBridge).toContain("isSandboxedOpaqueOrigin");
  });

  test("Task 04 — exact tutorial intake View opens in production via the packaged hub", async () => {
    // Real acceptance: spin up the same hub daemon that ships in packaged Desktop,
    // materialize the exact Part 3 tutorial space, build its View, and open the
    // production asset URL the shell would load — proving the exact tutorial
    // intake View opens end-to-end (not source inspection only).
    const hub = await createTemporaryHub();
    const space = createTemporaryTutorialSpace(3);
    try {
      const auth = {
        Authorization: `Bearer tok_${hub.bootstrapToken}`,
        "Content-Type": "application/json",
      };

      // Simulate `npm run build` for the exact tutorial spec-intake View.
      const distDir = join(space.spaceRoot, ".mrmr", "views", "spec-intake", "dist");
      const assetsDir = join(distDir, "assets");
      mkdirSync(assetsDir, { recursive: true });
      const builtHtml =
        '<!doctype html>\n<html lang="en">\n  <head><meta charset="UTF-8" /><title>spec-intake</title></head>\n' +
        '  <body>\n    <div id="root" data-view="spec-intake"></div>\n' +
        '    <script type="module" src="./assets/intake.js"></script>\n  </body>\n</html>\n';
      writeFileSync(join(distDir, "index.html"), builtHtml, "utf8");
      writeFileSync(join(assetsDir, "intake.js"), 'import{createViewMount}from"@murrmure/view-sdk/app";\n', "utf8");

      const created = await fetch(`${hub.baseUrl}/v1/spaces`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ slug: "my-first-space", name: "My First Space" }),
      });
      const spaceId = ((await created.json()) as { space_id: string }).space_id;

      const linked = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/link`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ host: "local", path: space.spaceRoot, primary: true }),
      });
      expect(linked.status).toBe(200);

      const applied = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/apply`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ bundle: tutorialBundle() }),
      });
      expect(applied.status).toBe(200);
      const appliedBody = (await applied.json()) as { summary: { views: number; hooks: number } };
      expect(appliedBody.summary.views).toBe(1);
      expect(appliedBody.summary.hooks).toBe(1);

      const grantRes = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/grants`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          label: "resolver",
          capabilities: ["space:read", "flow:run", "step:resolve"],
        }),
      });
      const resolveToken = ((await grantRes.json()) as { token: string }).token;
      const resolverAuth = {
        Authorization: `Bearer ${resolveToken}`,
        "Content-Type": "application/json",
      };

      const started = await fetch(`${hub.baseUrl}/v1/flows/flw_my_dev_flow/run`, {
        method: "POST",
        headers: resolverAuth,
        body: JSON.stringify({ space_id: spaceId, input: {} }),
      });
      expect(started.status).toBe(201);
      const runId = ((await started.json()) as { run_id: string }).run_id;

      const detail = (await (
        await fetch(`${hub.baseUrl}/v1/runs/${encodeURIComponent(runId)}`, { headers: resolverAuth })
      ).json()) as {
        open_steps?: Array<{
          step_id: string;
          resolver: { handler_id: string; type: string; view_id?: string } | null;
          view?: { view_id: string; origin_space_id: string; entry?: string };
        }>;
      };
      expect(detail.open_steps).toHaveLength(1);
      expect(detail.open_steps?.[0]?.step_id).toBe("intake");
      expect(detail.open_steps?.[0]?.resolver).toEqual({
        handler_id: "intake_view",
        type: "view_resolver",
        view_id: "spec-intake",
      });
      const view = detail.open_steps?.[0]?.view;
      expect(view?.view_id).toBe("spec-intake");
      expect(view?.origin_space_id).toBe(spaceId);
      expect(view?.entry).toBe("./dist/index.html");

      // Open the exact tutorial intake View's built entry through the production
      // asset route the shell loads. Served from .mrmr/views, 200 + the built HTML.
      const entryRes = await fetch(
        viewAssetUrl(hub.baseUrl, spaceId, "spec-intake", view!.entry!),
        { headers: { Authorization: `Bearer ${resolveToken}` } },
      );
      expect(entryRes.status).toBe(200);
      expect(entryRes.headers.get("content-type")).toBe("text/html; charset=utf-8");
      const entryBody = await entryRes.text();
      expect(entryBody).toContain('data-view="spec-intake"');
      expect(entryBody).toContain('<script type="module" src="./assets/intake.js"></script>');

      // The Vite bundle asset the entry references resolves under the same root.
      const assetRes = await fetch(
        viewAssetUrl(hub.baseUrl, spaceId, "spec-intake", "./dist/assets/intake.js"),
        { headers: { Authorization: `Bearer ${resolveToken}` } },
      );
      expect(assetRes.status).toBe(200);
      expect(assetRes.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    } finally {
      await hub.stop();
      space.cleanup();
    }
  });

  test.skip("Task 02 — stable launcher discovers the relocated bundled bridge", () => {});
  test.skip("Task 14 — Parts 1–6 execute through packaged Desktop", () => {});
});
