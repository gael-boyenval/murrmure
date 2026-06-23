import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/j01-happy-path", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;
  let instanceId: string;
  let gateId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-daemon-test-"));
    const dbPath = join(dir, "studio.db");
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

  test("POST /v1/spaces creates space", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "hp-1",
      },
      body: JSON.stringify({ slug: "review-alpha", actor_id: "actor_dev" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    spaceId = body.space_id;
    expect(spaceId).toMatch(/^spc_/);
  });

  test("create instance", async () => {
    const token = addTokenId(bootstrapToken);
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/instances`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "hp-2",
      },
      body: JSON.stringify({
        contract_ref_id: "cref_linear_demo",
        metadata: { title: "Feature X" },
        actor_id: "actor_dev",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    instanceId = body.instance_id;
    expect(instanceId).toMatch(/^ins_/);
  });

  test("submit transition creates gate", async () => {
    const token = addTokenId(bootstrapToken);
    const res = await fetch(
      `${baseUrl}/v1/spaces/${spaceId}/instances/${instanceId}/transitions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ event: "submit", expected_revision: 0, actor_id: "actor_dev" }),
      },
    );
    expect(res.status).toBe(202);
  });

  test("GET gates lists pending", async () => {
    const token = addTokenId(bootstrapToken);
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/gates`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gates.length).toBeGreaterThanOrEqual(1);
    gateId = body.gates[0].gate_id;
  });

  test("resolve gate", async () => {
    const token = addTokenId(bootstrapToken);
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/gates/${gateId}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved", instance_id: instanceId, actor_id: "actor_maya" }),
    });
    expect(res.status).toBe(200);
  });

  test("GET events tail", async () => {
    const token = addTokenId(bootstrapToken);
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/events?from_seq=0`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events.length).toBeGreaterThanOrEqual(1);
  });
});
