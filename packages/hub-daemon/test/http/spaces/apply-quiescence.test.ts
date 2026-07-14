import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

function bundle(flows: unknown[]) {
  return {
    actions: {
      digest: "sha256:q-actions",
      file: { version: 1, actions: { noop: { executor: "shell" } } },
    },
    executors: {
      digest: "sha256:q-exec",
      file: {
        version: 1,
        executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } },
      },
    },
    hooks: { digest: "sha256:q-hooks", file: { version: 1, hooks: {} } },
    handlers: {
      digest: "sha256:q-handlers",
      file: { version: 1, run_policies: [], handlers: [] },
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

describe("http/spaces/apply-quiescence", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceQ: string;
  let spaceRace: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-apply-quiesce-"));
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

    const q = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "quiesce", name: "Quiesce" }),
    });
    spaceQ = (await q.json()).space_id;
    // Index flow A in the quiescence space.
    await fetch(`${baseUrl}/v1/spaces/${spaceQ}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ bundle: bundle([manualFlow("flw_A", "alpha", "sha256:alpha-1")]) }),
    });

    const race = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "race", name: "Race" }),
    });
    spaceRace = (await race.json()).space_id;
    // Index flow A in the race space too.
    await fetch(`${baseUrl}/v1/spaces/${spaceRace}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ bundle: bundle([manualFlow("flw_A", "alpha", "sha256:alpha-1")]) }),
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

  async function apply(spaceId: string, flows: unknown[]) {
    return fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ bundle: bundle(flows) }),
    });
  }

  async function flowInSpace(spaceId: string, flowId: string): Promise<boolean> {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/index/flows`, { headers: auth() });
    const body = await res.json();
    const flows = (body.flows ?? []) as Array<{ flow_id: string }>;
    return flows.some((f) => f.flow_id === flowId);
  }

  test("apply during a non-terminal run returns 409 SPACE_HAS_ACTIVE_RUNS and preserves the prior index", async () => {
    const start = await startFlow(spaceQ, "flw_A", { n: 1 });
    expect(start.status).toBe(201);
    const runId = (await start.json()).run_id as string;

    const res = await apply(spaceQ, [manualFlow("flw_B", "beta", "sha256:beta-1")]);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("SPACE_HAS_ACTIVE_RUNS");
    expect(body.active_run_ids).toContain(runId);

    // Prior index preserved: flow A still indexed, flow B not added.
    expect(await flowInSpace(spaceQ, "flw_A")).toBe(true);
    expect(await flowInSpace(spaceQ, "flw_B")).toBe(false);

    // Keep the run for the next test.
  });

  test("apply is allowed immediately after all runs become terminal", async () => {
    // The run from the previous test is still non-terminal.
    const sessions = await fetch(`${baseUrl}/v1/sessions?space_id=${spaceQ}`, { headers: auth() });
    const sessBody = (await sessions.json()).sessions as Array<{ session_id: string }>;
    for (const s of sessBody) {
      const runsRes = await fetch(`${baseUrl}/v1/sessions/${s.session_id}/runs`, { headers: auth() });
      const runs = (await runsRes.json()).runs as Array<{ run_id: string }>;
      for (const r of runs) await cancelRun(r.run_id);
    }

    const res = await apply(spaceQ, [manualFlow("flw_B", "beta", "sha256:beta-1")]);
    expect(res.status).toBe(200);
    // Atomic swap: flow B added, flow A removed.
    expect(await flowInSpace(spaceQ, "flw_B")).toBe(true);
    expect(await flowInSpace(spaceQ, "flw_A")).toBe(false);
  });

  test("apply/start race: no partial index is visible (flow B is all-or-nothing)", async () => {
    const [startRes, applyRes] = await Promise.all([
      startFlow(spaceRace, "flw_A", { race: true }),
      apply(spaceRace, [
        manualFlow("flw_A", "alpha", "sha256:alpha-1"),
        manualFlow("flw_B", "beta", "sha256:beta-1"),
      ]),
    ]);

    // The start always admits (flow A is present, no capacity policy).
    expect(startRes.status).toBe(201);

    // The apply either committed before the run started (200) or was blocked by it (409).
    const applyStatus = applyRes.status;
    expect([200, 409]).toContain(applyStatus);

    if (applyStatus === 200) {
      // Apply won the race: flow B is fully indexed.
      expect(await flowInSpace(spaceRace, "flw_B")).toBe(true);
    } else {
      // Start won the race: apply was blocked, flow B is fully absent (no partial index).
      expect(await flowInSpace(spaceRace, "flw_B")).toBe(false);
    }

    // Clean up the run started by the race.
    const startBody = await startRes.json();
    await cancelRun(startBody.run_id);
  });
});
