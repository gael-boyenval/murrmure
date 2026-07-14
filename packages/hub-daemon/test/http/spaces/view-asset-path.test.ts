import { describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addTokenId } from "@murrmure/hub-core";
import { createTemporaryHub } from "../../../../../test-utils/tutorial-v3/helpers.js";

/**
 * Mirror of `resolveViewEntryUrl` (`packages/view-sdk/src/host-bridge.ts`) — the
 * shell builds production View asset URLs in exactly this shape. The hub-daemon
 * does not depend on view-sdk, so the URL is reconstructed here to exercise the
 * real production asset route the packaged shell-web bundle calls.
 */
function viewAssetUrl(base: string, spaceId: string, viewId: string, entry: string): string {
  const cleanEntry = entry.replace(/^\.\//, "").split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/$/, "")}/v1/spaces/${encodeURIComponent(spaceId)}/views/${encodeURIComponent(viewId)}/${cleanEntry}`;
}

describe("http/spaces/view-asset-path", () => {
  test("production View assets resolve from <space>/.mrmr/views (not murrmure/views)", async () => {
    const hub = await createTemporaryHub();
    const spaceRoot = mkdtempSync(join(tmpdir(), "murrmure-view-assets-"));
    try {
      const auth = {
        Authorization: `Bearer ${addTokenId(hub.bootstrapToken)}`,
        "Content-Type": "application/json",
      };

      const created = await fetch(`${hub.baseUrl}/v1/spaces`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ slug: "view-assets", name: "View Assets" }),
      });
      const spaceId = ((await created.json()) as { space_id: string }).space_id;

      // Built View assets live under <space>/.mrmr/views/{id}/dist (CLI scaffold
      // + `npm run build` + dev fixture route all use .mrmr/views). A decoy under
      // <space>/murrmure/views proves the route does NOT read the old path.
      const realEntry = join(spaceRoot, ".mrmr", "views", "intake", "dist", "index.html");
      const realAsset = join(spaceRoot, ".mrmr", "views", "intake", "dist", "assets", "intake.js");
      const decoyEntry = join(spaceRoot, "murrmure", "views", "intake", "dist", "index.html");
      mkdirSync(join(spaceRoot, ".mrmr", "views", "intake", "dist", "assets"), { recursive: true });
      mkdirSync(join(spaceRoot, "murrmure", "views", "intake", "dist"), { recursive: true });
      writeFileSync(realEntry, "<!doctype html><main data-testid=TUTORIAL-INTAKE></main>", "utf8");
      writeFileSync(realAsset, "console.info('intake');", "utf8");
      writeFileSync(decoyEntry, "WRONG-PATH-DECOY", "utf8");

      const linked = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/link`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ host: "local", path: spaceRoot, primary: true }),
      });
      expect(linked.status).toBe(200);

      const grantRes = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/grants`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ label: "reader", capabilities: ["space:read"] }),
      });
      const readToken = ((await grantRes.json()) as { token: string }).token;
      const readAuth = { Authorization: `Bearer ${readToken}` };

      // The exact tutorial intake entry opens from .mrmr/views, never the decoy.
      const entryRes = await fetch(viewAssetUrl(hub.baseUrl, spaceId, "intake", "./dist/index.html"), {
        headers: readAuth,
      });
      expect(entryRes.status).toBe(200);
      expect(entryRes.headers.get("content-type")).toBe("text/html; charset=utf-8");
      const entryBody = await entryRes.text();
      expect(entryBody).toContain("TUTORIAL-INTAKE");
      expect(entryBody).not.toContain("WRONG-PATH-DECOY");

      // Nested built assets (the Vite bundle) resolve under the same root.
      const assetRes = await fetch(viewAssetUrl(hub.baseUrl, spaceId, "intake", "./dist/assets/intake.js"), {
        headers: readAuth,
      });
      expect(assetRes.status).toBe(200);
      expect(assetRes.headers.get("content-type")).toBe("text/javascript; charset=utf-8");

      // Missing asset fails with the typed code; no partial content is served.
      const missingRes = await fetch(viewAssetUrl(hub.baseUrl, spaceId, "intake", "./dist/missing.js"), {
        headers: readAuth,
      });
      expect(missingRes.status).toBe(404);
      expect(((await missingRes.json()) as { code: string }).code).toBe("VIEW_ASSET_NOT_FOUND");

      // Unauthorized clients cannot read View assets (no token -> denied).
      const noAuthRes = await fetch(viewAssetUrl(hub.baseUrl, spaceId, "intake", "./dist/index.html"));
      expect(noAuthRes.status).toBe(403);
    } finally {
      await hub.stop();
      rmSync(spaceRoot, { recursive: true, force: true });
    }
  });
});
