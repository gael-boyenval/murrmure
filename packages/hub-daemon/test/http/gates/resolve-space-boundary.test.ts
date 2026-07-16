import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/gates/resolve-space-boundary", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceA: string;
  let spaceB: string;
  let spaceAToken: string;
  let gateBId: string;
  let gateAId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-gate-boundary-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000077";
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

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    });

    const makeSpace = async (slug: string) => {
      const res = await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug }),
      });
      return (await res.json()).space_id as string;
    };
    spaceA = await makeSpace("gate-boundary-a");
    spaceB = await makeSpace("gate-boundary-b");

    // Token scoped to space A with flow:run — it may resolve space-A gates only.
    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceA}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ label: "space-a-runner", scopes: ["space:read", "flow:run"] }),
    });
    spaceAToken = (await grantRes.json()).token as string;

    const makeGate = async (spaceId: string) => {
      const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ title: `Gate ${spaceId}`, space_id: spaceId }),
      });
      const session = await sessionRes.json();
      const runRes = await fetch(`${baseUrl}/v1/sessions/${session.session_id}/runs`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ space_id: spaceId, flow_id: null }),
      });
      const run = await runRes.json();
      expect(runRes.status).toBe(201);
      const gateRes = await fetch(`${baseUrl}/v1/runs/${run.run.run_id}/gates`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({
          session_id: session.session_id,
          space_id: spaceId,
          step_id: "gate:review",
          action_name: "review_url",
        }),
      });
      expect(gateRes.status).toBe(201);
      return ((await gateRes.json()) as { gate: { gate_id: string } }).gate.gate_id;
    };
    gateBId = await makeGate(spaceB);
    gateAId = await makeGate(spaceA);
  });

  afterAll(() => cleanup?.());

  const spaceAHeaders = () => ({
    Authorization: `Bearer ${spaceAToken}`,
    "Content-Type": "application/json",
  });
  const bootstrapHeaders = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("space-A token cannot resolve a space-B gate (403)", async () => {
    const res = await fetch(`${baseUrl}/v1/gates/${gateBId}/resolve`, {
      method: "POST",
      headers: spaceAHeaders(),
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("SCOPE_ENFORCEMENT_FAILURE");
  });

  test("bootstrap (privileged) can resolve a space-B gate (200)", async () => {
    const res = await fetch(`${baseUrl}/v1/gates/${gateBId}/resolve`, {
      method: "POST",
      headers: bootstrapHeaders(),
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(res.status).toBe(200);
  });

  test("space-A token can resolve a space-A gate (200)", async () => {
    const res = await fetch(`${baseUrl}/v1/gates/${gateAId}/resolve`, {
      method: "POST",
      headers: spaceAHeaders(),
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(res.status).toBe(200);
  });
});
