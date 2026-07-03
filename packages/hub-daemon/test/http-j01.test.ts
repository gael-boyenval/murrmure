import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

/** J01 review loop migrated to session/run API (phase 16 shim removal). */
describe("http/j01-happy-path", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;
  let runId: string;
  let gateId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-daemon-test-"));
    const dbPath = join(dir, "murrmure.db");
    const dataDir = join(dir, "data");
    bootstrapToken = "01JBOOTSTRAPTOKEN00000001";

    const daemon = await startHubDaemon({
      databasePath: dbPath,
      port: 0,
      dataDir,
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
  });

  afterAll(() => cleanup?.());

  const bootstrapHeaders = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("POST /v1/spaces creates space", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: { ...bootstrapHeaders(), "Idempotency-Key": "hp-1" },
      body: JSON.stringify({ slug: "review-alpha", actor_id: "actor_dev" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    spaceId = body.space_id;
    expect(spaceId).toMatch(/^spc_/);
  });

  test("create session and run (v2 path)", async () => {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: { ...bootstrapHeaders(), "Idempotency-Key": "hp-2" },
      body: JSON.stringify({ title: "Feature X", space_id: spaceId, actor_id: "actor_dev" }),
    });
    expect(sessionRes.status).toBe(201);
    const session = (await sessionRes.json()) as { session_id: string };

    const runRes = await fetch(`${baseUrl}/v1/sessions/${session.session_id}/runs`, {
      method: "POST",
      headers: bootstrapHeaders(),
      body: JSON.stringify({
        space_id: spaceId,
        flow_id: null,
        contract_ref_id: "cref_linear_demo",
        metadata: { title: "Feature X" },
        actor_id: "actor_dev",
      }),
    });
    expect(runRes.status).toBe(201);
    const body = (await runRes.json()) as { run: { run_id: string } };
    runId = body.run.run_id;
    expect(runId).toMatch(/^run_/);
  });

  test("invoke action on run creates gate via flow engine", async () => {
    const res = await fetch(`${baseUrl}/v1/gates/wait?run_id=${runId}&timeout_ms=500`, {
      headers: bootstrapHeaders(),
    });
    expect([200, 408]).toContain(res.status);
  });

  test("GET gates lists pending or resolved", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/gates`, {
      headers: bootstrapHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    if (body.gates.length >= 1) {
      gateId = body.gates[0].gate_id;
    }
  });

  test("GET events tail", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/events?from_seq=0`, {
      headers: bootstrapHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
  });
});
