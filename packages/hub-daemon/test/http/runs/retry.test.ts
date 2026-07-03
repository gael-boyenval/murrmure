import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/runs/retry", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-runs-retry-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000010";
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
      body: JSON.stringify({ slug: "runs-retry", name: "Runs Retry" }),
    });
    spaceId = (await created.json()).space_id;
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("retry creates new run with reference_run_ids", async () => {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ title: "Retry session", space_id: spaceId }),
    });
    const session = (await sessionRes.json()) as { session_id: string };

    const runRes = await fetch(`${baseUrl}/v1/sessions/${session.session_id}/runs`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ flow_id: null, space_id: spaceId }),
    });
    const { run: firstRun } = (await runRes.json()) as { run: { run_id: string } };

    await fetch(`${baseUrl}/v1/runs/${firstRun.run_id}/cancel`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ space_id: spaceId }),
    });

    const retryRes = await fetch(`${baseUrl}/v1/runs/${firstRun.run_id}/retry`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ space_id: spaceId }),
    });
    expect(retryRes.status).toBe(201);
    const retryBody = (await retryRes.json()) as { run: { run_id: string; reference_run_ids: string[] } };
    expect(retryBody.run.run_id).not.toBe(firstRun.run_id);
    expect(retryBody.run.reference_run_ids).toContain(firstRun.run_id);

    const restart = await fetch(`${baseUrl}/v1/runs/${firstRun.run_id}/cancel`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ space_id: spaceId }),
    });
    expect(restart.status).toBe(409);
  });
});
