import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("triggers/dedup-spec-publish", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let backendId: string;
  let frontendId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "tr-dedup-"));
    const daemon = await startHubDaemon({
      databasePath: join(dir, "studio.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
    });
    const port = (daemon.server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    backendId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "backend-api", name: "Backend" }),
      })
    ).json()).space_id;

    frontendId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "ui-sandbox", name: "UI Sandbox" }),
      })
    ).json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${frontendId}/triggers/from-template`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        template_id: "work-ready-wake-frontend",
        source_space_id: backendId,
        target_space_id: frontendId,
      }),
    });
  });

  afterAll(() => cleanup?.());

  test("duplicate work.ready deduped by openapi_diff_ref", async () => {
    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    const payload = {
      type: "api_change",
      summary: "New endpoint",
      openapi_diff_ref: "blob:openapi/rec-v1.diff",
    };

    for (let i = 0; i < 2; i++) {
      await fetch(`${baseUrl}/v1/spaces/${backendId}/events`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ type: "work.ready", payload }),
      });
    }

    const deliveries = await fetch(`${baseUrl}/v1/spaces/${frontendId}/triggers/deliveries?limit=10`, {
      headers: bootstrap(),
    });
    const dBody = await deliveries.json();
    expect(dBody.deliveries.filter((d: { outcome: string }) => d.outcome === "success").length).toBe(1);
    const deduped = dBody.deliveries.find((d: { outcome: string }) => d.outcome === "deduped");
    expect(deduped?.dedup_reason).toBe("duplicate_business_key");
  });
});
