import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";

describe("http/gates/resolve", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;
  let runId: string;
  let gateId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-gates-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000099";
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

    const spaceRes = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "gate-resolve-space", name: "Gate Resolve" }),
    });
    spaceId = (await spaceRes.json()).space_id as string;

    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ title: "Gate session", space_id: spaceId }),
    });
    const session = await sessionRes.json();

    const runRes = await fetch(`${baseUrl}/v1/sessions/${session.session_id}/runs`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ space_id: spaceId, flow_id: null }),
    });
    const runBody = await runRes.json();
    expect(runRes.status).toBe(201);
    runId = runBody.run.run_id as string;

    const gateRes = await fetch(`${baseUrl}/v1/runs/${runId}/gates`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        session_id: session.session_id,
        space_id: spaceId,
        step_id: "gate:review",
        action_name: "review_url",
        form: {
          id: "review.v1",
          fields: [{ name: "decision", type: "enum", values: ["approve", "reject"] }],
        },
      }),
    });
    if (gateRes.status !== 201) {
      throw new Error(`gate create: ${gateRes.status} ${JSON.stringify(await gateRes.json())}`);
    }
    gateId = ((await gateRes.json()) as { gate: { gate_id: string } }).gate.gate_id;
  });

  afterAll(() => cleanup?.());

  test("gate resolve journals mrmr.gate.resolved and clears notification", async () => {
    const auth = {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };

    const pendingBefore = await fetch(`${baseUrl}/v1/notifications?status=pending`, { headers: auth });
    expect((await pendingBefore.json()).pending_count).toBeGreaterThan(0);

    const resolveRes = await fetch(`${baseUrl}/v1/gates/${gateId}/resolve`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ decision: "approved", form_values: { notes: "ok" } }),
    });
    expect(resolveRes.status).toBe(200);

    const journalAll = await fetch(
      `${baseUrl}/v1/journal?type=${encodeURIComponent(JOURNAL_EVENT_TYPES.GATE_RESOLVED)}`,
      { headers: auth },
    );
    const journal = await journalAll.json();
    expect(journal.entries.some((e: { type: string }) => e.type === JOURNAL_EVENT_TYPES.GATE_RESOLVED)).toBe(true);

    const gatesRes = await fetch(`${baseUrl}/v1/runs/${runId}/gates`, { headers: auth });
    const gatesBody = await gatesRes.json();
    expect(gatesBody.gates[0]?.status).toBe("approved");

    const pendingAfter = await fetch(`${baseUrl}/v1/notifications?status=pending`, { headers: auth });
    expect((await pendingAfter.json()).pending_count).toBe(0);
  });

  test("gate rejection fails run and creates run_failed notification", async () => {
    const auth = {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };

    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ title: "Reject session", space_id: spaceId }),
    });
    const session = await sessionRes.json();

    const runRes = await fetch(`${baseUrl}/v1/sessions/${session.session_id}/runs`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ space_id: spaceId, flow_id: null }),
    });
    const rejectRunId = ((await runRes.json()) as { run: { run_id: string } }).run.run_id;

    const gateRes = await fetch(`${baseUrl}/v1/runs/${rejectRunId}/gates`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        session_id: session.session_id,
        space_id: spaceId,
        step_id: "gate:reject-test",
        action_name: "review_url",
      }),
    });
    const rejectGateId = ((await gateRes.json()) as { gate: { gate_id: string } }).gate.gate_id;

    const resolveRes = await fetch(`${baseUrl}/v1/gates/${rejectGateId}/resolve`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ decision: "rejected" }),
    });
    expect(resolveRes.status).toBe(200);

    const runCheck = await fetch(`${baseUrl}/v1/runs/${rejectRunId}`, { headers: auth });
    const runBody = await runCheck.json();
    expect(runBody.lifecycle).toBe("failed");

    const notifications = await fetch(`${baseUrl}/v1/notifications?status=pending`, { headers: auth });
    const notifBody = (await notifications.json()) as {
      notifications: Array<{ kind: string; run_id?: string }>;
    };
    expect(notifBody.notifications.some((n) => n.kind === "run_failed" && n.run_id === rejectRunId)).toBe(true);
  });
});
