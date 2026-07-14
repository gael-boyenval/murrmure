import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";

function shellBundle(flows: unknown[], runPolicies: unknown[] = []) {
  return {
    actions: {
      digest: "sha256:cap-actions",
      file: { version: 1, actions: { noop: { executor: "shell" } } },
    },
    executors: {
      digest: "sha256:cap-exec",
      file: {
        version: 1,
        executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } },
      },
    },
    hooks: { digest: "sha256:cap-hooks", file: { version: 1, hooks: {} } },
    handlers: {
      digest: "sha256:cap-handlers",
      file: { version: 1, run_policies: runPolicies, handlers: [] },
    },
    flows,
    views: [],
  };
}

function manualFlow(flowId: string, name: string, digest: string) {
  return {
    flow_id: flowId,
    rel_path: `flows/${name}/flow.manifest.yaml`,
    digest,
    manifest: {
      apiVersion: "murrmure.flow/v1",
      name,
      triggers: { manual: true },
      steps: [{ id: "work", description: "work" }],
    },
  };
}

function eventFlow(flowId: string, name: string, digest: string, source: string) {
  return {
    flow_id: flowId,
    rel_path: `flows/${name}/flow.manifest.yaml`,
    digest,
    manifest: {
      apiVersion: "murrmure.flow/v1",
      name,
      triggers: {
        manual: false,
        events: [{ type: "mrmr.capacity.test", source }],
      },
      steps: [{ id: "work", description: "work" }],
    },
  };
}

describe("http/flows/run-capacity", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let manualSpaceId: string;
  let triggerSpaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-run-capacity-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000009";
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

    const manual = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "capacity", name: "Capacity" }),
    });
    manualSpaceId = (await manual.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${manualSpaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        bundle: shellBundle(
          [
            manualFlow("flw_my_dev", "my-dev-flow", "sha256:mydev-1"),
            manualFlow("flw_unbounded", "unbounded-flow", "sha256:unbounded-1"),
          ],
          [{ flow: "my-dev-flow", max_concurrent_runs: 1 }],
        ),
      }),
    });

    const trigger = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "capacity-trigger", name: "Capacity Trigger" }),
    });
    triggerSpaceId = (await trigger.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${triggerSpaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        bundle: shellBundle(
          [
            eventFlow(
              "flw_on_event",
              "on-event",
              "sha256:onevent-1",
              `/spaces/${triggerSpaceId}`,
            ),
          ],
          [{ flow: "on-event", max_concurrent_runs: 1 }],
        ),
      }),
    });
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  async function startFlow(spaceId: string, flowId: string, input: Record<string, unknown> = {}) {
    return fetch(`${baseUrl}/v1/flows/${flowId}/run`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ space_id: spaceId, input }),
    });
  }

  async function cancelRun(runId: string) {
    return fetch(`${baseUrl}/v1/runs/${runId}/cancel`, { method: "POST", headers: auth() });
  }

  test("manual overflow returns 409 FLOW_CONCURRENCY_LIMIT with active IDs and no queued run", async () => {
    const first = await startFlow(manualSpaceId, "flw_my_dev", { n: 1 });
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    const runId = firstBody.run_id as string;

    const second = await startFlow(manualSpaceId, "flw_my_dev", { n: 2 });
    expect(second.status).toBe(409);
    const secondBody = await second.json();
    expect(secondBody.code).toBe("FLOW_CONCURRENCY_LIMIT");
    expect(secondBody.max_concurrent_runs).toBe(1);
    expect(secondBody.active_run_ids).toEqual([runId]);
    expect(secondBody.flow_id).toBe("flw_my_dev");

    // Cleanup so later tests start from a quiescent space.
    await cancelRun(runId);
  });

  test("unbounded flow admits concurrent runs (no policy)", async () => {
    const a = await startFlow(manualSpaceId, "flw_unbounded", { n: 1 });
    const b = await startFlow(manualSpaceId, "flw_unbounded", { n: 2 });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const aBody = await a.json();
    const bBody = await b.json();
    expect(aBody.run_id).not.toBe(bBody.run_id);

    await cancelRun(aBody.run_id);
    await cancelRun(bBody.run_id);
  });

  test("retry after termination performs a fresh admission check and succeeds", async () => {
    const first = await startFlow(manualSpaceId, "flw_my_dev", { n: "retry" });
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const denied = await startFlow(manualSpaceId, "flw_my_dev", { n: "retry2" });
    expect(denied.status).toBe(409);

    await cancelRun(firstBody.run_id);

    const retry = await startFlow(manualSpaceId, "flw_my_dev", { n: "retry3" });
    expect(retry.status).toBe(201);
    const retryBody = await retry.json();
    await cancelRun(retryBody.run_id);
  });

  test("trigger denial is journaled (FLOW_START_DENIED) and a later retry succeeds", async () => {
    const emit = (extra: Record<string, unknown> = {}) =>
      fetch(`${baseUrl}/v1/spaces/${triggerSpaceId}/events`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ event_type: "mrmr.capacity.test", payload: { ...extra } }),
      });

    // First event starts a run.
    await emit({ seed: 1 });
    const sessionsAfterFirst = await fetch(
      `${baseUrl}/v1/sessions?space_id=${triggerSpaceId}`,
      { headers: auth() },
    );
    const afterFirst = (await sessionsAfterFirst.json()).sessions as Array<{ session_id: string }>;
    expect(afterFirst.length).toBeGreaterThanOrEqual(1);

    // Second event is denied at capacity; no new run, but a denial is journaled.
    await emit({ seed: 2 });
    const sessionsAfterSecond = await fetch(
      `${baseUrl}/v1/sessions?space_id=${triggerSpaceId}`,
      { headers: auth() },
    );
    const afterSecond = (await sessionsAfterSecond.json()).sessions as Array<{ session_id: string }>;
    expect(afterSecond.length).toBe(afterFirst.length);

    const journal = await fetch(
      `${baseUrl}/v1/journal?type=${JOURNAL_EVENT_TYPES.FLOW_START_DENIED}&space_id=${triggerSpaceId}`,
      { headers: auth() },
    );
    expect(journal.status).toBe(200);
    const journalBody = await journal.json();
    const denials = journalBody.entries as Array<{ type: string; data?: Record<string, unknown> }>;
    expect(denials.some((e) => e.type === JOURNAL_EVENT_TYPES.FLOW_START_DENIED)).toBe(true);
    const denial = denials.find((e) => e.type === JOURNAL_EVENT_TYPES.FLOW_START_DENIED);
    expect(denial?.data?.flow_id).toBe("flw_on_event");
    expect(denial?.data?.max_concurrent_runs).toBe(1);
    expect(Array.isArray(denial?.data?.active_run_ids)).toBe(true);

    // Terminate the active run, then a later retry event succeeds (fresh admission).
    const runsRes = await fetch(`${baseUrl}/v1/sessions/${afterFirst[0]!.session_id}/runs`, {
      headers: auth(),
    });
    const runs = (await runsRes.json()).runs as Array<{ run_id: string }>;
    for (const r of runs) await cancelRun(r.run_id);

    await emit({ seed: 3 });
    const sessionsAfterRetry = await fetch(
      `${baseUrl}/v1/sessions?space_id=${triggerSpaceId}`,
      { headers: auth() },
    );
    const afterRetry = (await sessionsAfterRetry.json()).sessions as Array<{ session_id: string }>;
    expect(afterRetry.length).toBeGreaterThan(afterSecond.length);
  });
});
