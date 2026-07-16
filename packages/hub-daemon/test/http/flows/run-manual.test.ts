import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

const MORNING_BRIEF_BUNDLE = {
  actions: {
    digest: "sha256:mb-actions",
    file: {
      version: 1,
      actions: {
        overnight_research: { executor: "shell" },
      },
    },
  },
  executors: {
    digest: "sha256:mb-exec",
    file: {
      version: 1,
      executors: {
        shell: { binding: { type: "shell_spawn", executor_id: "shell" } },
      },
    },
  },
  hooks: {
    digest: "sha256:mb-hooks",
    file: { version: 1, hooks: {} },
  },
  flows: [
    {
      flow_id: "flw_morning_brief",
      rel_path: "flows/morning-brief/flow.manifest.yaml",
      digest: "sha256:mb-flow",
      manifest: {
        apiVersion: "murrmure.flow/v1",
        name: "morning-brief",
        triggers: { manual: true, idempotency: "run_key" },
        steps: [{ id: "research", description: "research" }],
      },
    },
  ],
  views: [],
};

describe("http/flows/run-manual", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-flow-manual-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000003";
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
      body: JSON.stringify({ slug: "brief", name: "Brief" }),
    });
    const body = await created.json();
    spaceId = body.space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ bundle: MORNING_BRIEF_BUNDLE }),
    });
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("POST /v1/flows/:id/run creates session and run with flow_digest", async () => {
    const res = await fetch(`${baseUrl}/v1/flows/flw_morning_brief/run`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ space_id: spaceId, input: { topic: "news" } }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.session.session_id).toMatch(/^ses_/);
    expect(body.run_id).toMatch(/^run_/);
    expect(body.flow_digest).toMatch(/^sha256:/);
  });

  test("idempotent run_key returns same run", async () => {
    const key = "idem-test-key";
    const first = await fetch(`${baseUrl}/v1/flows/flw_morning_brief/run`, {
      method: "POST",
      headers: { ...auth(), "Idempotency-Key": key },
      body: JSON.stringify({ space_id: spaceId, input: { topic: "sports" }, idempotency_key: key }),
    });
    const firstBody = await first.json();
    const second = await fetch(`${baseUrl}/v1/flows/flw_morning_brief/run`, {
      method: "POST",
      headers: { ...auth(), "Idempotency-Key": key },
      body: JSON.stringify({ space_id: spaceId, input: { topic: "sports" }, idempotency_key: key }),
    });
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    expect(secondBody.deduplicated).toBe(true);
    expect(secondBody.run_id).toBe(firstBody.run_id);
  });
});
