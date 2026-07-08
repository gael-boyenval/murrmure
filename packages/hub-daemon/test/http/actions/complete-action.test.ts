import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { projectStepMemoFromJournal } from "../../../src/routes/sessions/index.js";

describe("http/actions/complete-action", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;
  let daemonCtx: Awaited<ReturnType<typeof startHubDaemon>>;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-complete-action-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000022";
    daemonCtx = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const addr = daemonCtx.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemonCtx.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const auth = {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };

    const created = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "complete-action", name: "Complete Action" }),
    });
    spaceId = (await created.json()).space_id;
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("POST complete advances step output for working invoke", async () => {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ title: "complete test", space_id: spaceId }),
    });
    const session = (await sessionRes.json()) as { session_id: string };

    const runRes = await fetch(`${baseUrl}/v1/sessions/${session.session_id}/runs`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ flow_id: null, input: {}, space_id: spaceId }),
    });
    const runBody = (await runRes.json()) as { run: { run_id: string } };
    const runId = runBody.run.run_id;
    const runBare = runId.startsWith("run_") ? runId.slice(4) : runId;
    await daemonCtx.ctx.murrmurePersistence.updateRunFlowBinding(runBare, {
      flow_id: "preview-review",
      flow_digest: "sha256:test",
    });

    await projectStepMemoFromJournal(daemonCtx.ctx, {
      run_id: runId,
      step_id: "build",
      type: JOURNAL_EVENT_TYPES.ACTION_DISPATCHED,
      ts: "2026-01-01T00:00:01.000Z",
    });

    const completeRes = await fetch(
      `${baseUrl}/v1/runs/${encodeURIComponent(runId)}/steps/build/complete`,
      {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({
          result: { preview_url: "http://toto.local:3000", validated: true },
        }),
      },
    );
    expect(completeRes.status).toBe(200);
    const completeBody = (await completeRes.json()) as { dispatch?: { status?: string } };
    expect(completeBody.dispatch?.status).toBe("completed");

    const getRun = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}`, {
      headers: auth(),
    });
    const runDetail = (await getRun.json()) as {
      exec_context?: { steps?: Record<string, { output?: Record<string, unknown> }> };
    };
    expect(runDetail.exec_context?.steps?.build?.output?.preview_url).toBe("http://toto.local:3000");
  });
});
