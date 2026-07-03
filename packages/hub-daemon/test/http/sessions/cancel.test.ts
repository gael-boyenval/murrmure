import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/sessions/cancel", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-sessions-cancel-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000009";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
      cancelTimeoutMs: 50,
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
      body: JSON.stringify({ slug: "sessions-cancel", name: "Sessions Cancel" }),
    });
    spaceId = (await created.json()).space_id;
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("session cancel cascades runs within cap", async () => {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ title: "Cancel me", space_id: spaceId }),
    });
    const session = (await sessionRes.json()) as { session_id: string };

    const runRes = await fetch(`${baseUrl}/v1/sessions/${session.session_id}/runs`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ flow_id: null, space_id: spaceId }),
    });
    expect(runRes.status).toBe(201);
    const runBody = (await runRes.json()) as { run: { run_id: string } };
    const runId = runBody.run.run_id;

    const cancel = await fetch(`${baseUrl}/v1/sessions/${session.session_id}/cancel`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ space_id: spaceId }),
    });
    expect(cancel.status).toBe(200);

    await new Promise((r) => setTimeout(r, 80));

    const getRun = await fetch(`${baseUrl}/v1/runs/${runId}`, { headers: auth() });
    const runDetail = await getRun.json();
    expect(runDetail.lifecycle).toBe("cancelled");
  });
});
