import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/spaces/home", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-space-home-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000005";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const auth = {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };
    const created = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "home", name: "Home" }),
    });
    spaceId = (await created.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:home-actions",
            file: { version: 1, actions: { ping: { executor: "shell" } } },
          },
          hooks: {
            digest: "sha256:home-hooks",
            file: {
              version: 1,
              hooks: {
                "on-work-ready": {
                  on: { event: { type: "mrmr.work.ready" } },
                  do: [{ ensure_session: { title: "Work ready" } }],
                },
              },
            },
          },
          flows: [
            {
              flow_id: "flw_home_demo",
              rel_path: "flows/demo/flow.manifest.yaml",
              digest: "sha256:home-flow",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "home-demo",
                start: { manual: true },
                steps: [{ id: "ping", invoke: { space: "{{origin_space}}", action: "ping" } }],
              },
            },
          ],
          views: [],
        },
      }),
    });

    await fetch(`${baseUrl}/v1/flows/flw_home_demo/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ space_id: spaceId, input: {} }),
    });
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("GET /v1/spaces/:id/home returns sections including index", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/home`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("needs_attention");
    expect(body).toHaveProperty("active_runs");
    expect(body).toHaveProperty("your_flows");
    expect(body).toHaveProperty("available_to_run");
    expect(body).toHaveProperty("receiving_from");
    expect(body).toHaveProperty("recent_completed");
    expect(body).toHaveProperty("index");
    expect(body).toHaveProperty("emittable_events");
    expect(Array.isArray(body.emittable_events)).toBe(true);
    expect(body.index.counts.hooks).toBe(1);
    expect(body.index.hooks[0].hook_id).toBe("on-work-ready");
    expect(body.index.events.some((e: { event_type: string }) => e.event_type === "mrmr.work.ready")).toBe(
      true,
    );
    expect(body.your_flows.some((f: { flow_id: string }) => f.flow_id === "flw_home_demo")).toBe(true);
    expect(body.active_runs.length).toBeGreaterThan(0);
  });

  test("flow preview requires flow:read", async () => {
    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ label: "read-only", scopes: ["space:read", "flow:read"] }),
    });
    const readToken = (await grantRes.json()).token as string;

    const preview = await fetch(`${baseUrl}/v1/spaces/${spaceId}/flows/flw_home_demo/preview`, {
      headers: { Authorization: `Bearer ${readToken}` },
    });
    expect(preview.status).toBe(200);

    const runAttempt = await fetch(`${baseUrl}/v1/flows/flw_home_demo/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${readToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ space_id: spaceId, input: {} }),
    });
    expect(runAttempt.status).toBe(403);
  });
});
