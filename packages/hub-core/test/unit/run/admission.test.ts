import { describe, expect, test } from "vitest";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { FLOW_CONCURRENCY_LIMIT, SPACE_HAS_ACTIVE_RUNS } from "@murrmure/contracts";
import {
  admitFlowRun,
  assertSpaceQuiescent,
  NON_TERMINAL_LIFECYCLES,
} from "../../../src/run/admission.js";
import { buildRunPolicyRows } from "../../../src/index/run-policy.js";
import type { RunLifecycle } from "@murrmure/contracts";

const NOW = "2026-07-15T00:00:00.000Z";
const SPACE = "demo";
const FLOW = "flw_limited";

async function installPolicy(
  studio: MemoryStudioPersistence,
  flowId: string,
  max: number,
  digest = "sha256:p",
): Promise<void> {
  const snapshot = await studio.getSpaceIndexSnapshot(SPACE);
  await studio.replaceSpaceIndex(SPACE, {
    ...snapshot,
    run_policies: buildRunPolicyRows([
      {
        flow: "limited",
        max_concurrent_runs: max,
        origin_space_id: `spc_${SPACE}`,
        flow_id: flowId,
        flow_digest: digest,
      },
    ]),
  });
}

async function insertRun(
  studio: MemoryStudioPersistence,
  runId: string,
  lifecycle: RunLifecycle,
  flowId = FLOW,
): Promise<void> {
  await studio.insertRun(
    {
      run_id: runId,
      session_id: "ses_1",
      space_id: SPACE,
      flow_id: flowId,
      lifecycle,
      exec_context: {},
      reference_run_ids: [],
      started_at: NOW,
    },
    NOW,
  );
}

async function freshStudio(): Promise<MemoryStudioPersistence> {
  const studio = new MemoryStudioPersistence();
  await studio.insertSpace(
    { space_id: SPACE, slug: "demo", name: "Demo", status: "active", members: [] },
    NOW,
  );
  return studio;
}

describe("admitFlowRun", () => {
  test("no policy means unlimited (always ok)", async () => {
    const studio = await freshStudio();
    await insertRun(studio, "r1", "working");
    await insertRun(studio, "r2", "working");
    const res = await admitFlowRun(studio, { space_id: `spc_${SPACE}`, flow_id: FLOW });
    expect(res.ok).toBe(true);
  });

  test("limit 1: zero active admits, one active denies with active IDs", async () => {
    const studio = await freshStudio();
    await installPolicy(studio, FLOW, 1);

    expect((await admitFlowRun(studio, { space_id: `spc_${SPACE}`, flow_id: FLOW })).ok).toBe(true);

    await insertRun(studio, "r_active", "working");
    const denied = await admitFlowRun(studio, { space_id: `spc_${SPACE}`, flow_id: FLOW });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe(FLOW_CONCURRENCY_LIMIT);
      expect(denied.error.max_concurrent_runs).toBe(1);
      expect(denied.error.active_run_ids).toEqual(["run_r_active"]);
      expect(denied.error.flow_id).toBe(FLOW);
    }
  });

  test("overflow reports every active blocker, not only enough to reach the limit", async () => {
    const studio = await freshStudio();
    await installPolicy(studio, FLOW, 1);
    await insertRun(studio, "r_active_1", "working");
    await insertRun(studio, "r_active_2", "input-required");

    const denied = await admitFlowRun(studio, { space_id: `spc_${SPACE}`, flow_id: FLOW });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect([...denied.error.active_run_ids].sort()).toEqual([
        "run_r_active_1",
        "run_r_active_2",
      ]);
    }
  });

  test("limit 2: admits up to two, denies the third (exact boundary)", async () => {
    const studio = await freshStudio();
    await installPolicy(studio, FLOW, 2);

    expect((await admitFlowRun(studio, { space_id: `spc_${SPACE}`, flow_id: FLOW })).ok).toBe(true);
    await insertRun(studio, "r1", "working");
    expect((await admitFlowRun(studio, { space_id: `spc_${SPACE}`, flow_id: FLOW })).ok).toBe(true);
    await insertRun(studio, "r2", "working");
    const denied = await admitFlowRun(studio, { space_id: `spc_${SPACE}`, flow_id: FLOW });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.max_concurrent_runs).toBe(2);
  });

  test("only non-terminal runs count toward capacity", async () => {
    const studio = await freshStudio();
    await installPolicy(studio, FLOW, 1);
    // Terminal runs do not block.
    await insertRun(studio, "r_done", "completed");
    await insertRun(studio, "r_failed", "failed");
    await insertRun(studio, "r_cancelled", "cancelled");
    const res = await admitFlowRun(studio, { space_id: `spc_${SPACE}`, flow_id: FLOW });
    expect(res.ok).toBe(true);
  });

  test("a different flow's runs do not count toward this flow's capacity", async () => {
    const studio = await freshStudio();
    await installPolicy(studio, FLOW, 1);
    await insertRun(studio, "r_other", "working", "flw_other");
    expect((await admitFlowRun(studio, { space_id: `spc_${SPACE}`, flow_id: FLOW })).ok).toBe(true);
  });

  test("NON_TERMINAL_LIFECYCLES are working and input-required", () => {
    expect(NON_TERMINAL_LIFECYCLES).toEqual(["working", "input-required"]);
  });
});

describe("assertSpaceQuiescent", () => {
  test("no runs -> quiescent (ok)", async () => {
    const studio = await freshStudio();
    expect((await assertSpaceQuiescent(studio, SPACE)).ok).toBe(true);
  });

  test("non-terminal run blocks apply with active IDs", async () => {
    const studio = await freshStudio();
    await insertRun(studio, "r_active", "input-required");
    const res = await assertSpaceQuiescent(studio, SPACE);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(SPACE_HAS_ACTIVE_RUNS);
      expect(res.error.active_run_ids).toEqual(["run_r_active"]);
    }
  });

  test("only terminal runs -> quiescent (ok)", async () => {
    const studio = await freshStudio();
    await insertRun(studio, "r1", "completed");
    await insertRun(studio, "r2", "failed");
    await insertRun(studio, "r3", "cancelled");
    expect((await assertSpaceQuiescent(studio, SPACE)).ok).toBe(true);
  });
});
