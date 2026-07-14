import { describe, expect, test, vi } from "vitest";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { FLOW_CONCURRENCY_LIMIT } from "@murrmure/contracts";
import type { FlowIndexEntry, FlowManifest } from "@murrmure/contracts";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import { startFlowRun } from "../../../src/flow-engine/run-service.js";
import { SpaceConcurrencyGuard } from "../../../src/run/space-guard.js";
import { buildRunPolicyRows } from "../../../src/index/run-policy.js";
import type { FlowRunServiceDeps } from "../../../src/flow-engine/run-service.js";
import type { HubHandler } from "../../../src/handlers/hub.js";

const NOW = "2026-07-15T00:00:00.000Z";
const SPACE = "demo";
const ORIGIN = `spc_${SPACE}`;

function makeEntry(flowId: string, name: string): FlowIndexEntry {
  const manifest: FlowManifest = {
    apiVersion: "murrmure.flow/v1",
    name,
    triggers: { manual: true },
    steps: [{ id: "work", description: "work" }],
  };
  const ir = compileFlowIr(manifest, flowId);
  return {
    flow_id: flowId,
    origin_space_id: ORIGIN,
    digest: ir.digest,
    name,
    triggers: manifest.triggers,
    step_spaces: [ORIGIN],
    grants_required: ["flow:run"],
    ir,
  };
}

async function freshStudio(): Promise<MemoryStudioPersistence> {
  const studio = new MemoryStudioPersistence();
  await studio.insertSpace(
    { space_id: SPACE, slug: "demo", name: "Demo", status: "active", members: [] },
    NOW,
  );
  return studio;
}

async function installPolicy(
  studio: MemoryStudioPersistence,
  entry: FlowIndexEntry,
  max: number,
): Promise<void> {
  const snapshot = await studio.getSpaceIndexSnapshot(SPACE);
  await studio.replaceSpaceIndex(SPACE, {
    ...snapshot,
    flows: [{ ...entry, payload_json: JSON.stringify(entry) }],
    run_policies: buildRunPolicyRows([
      {
        flow: entry.name,
        max_concurrent_runs: max,
        origin_space_id: ORIGIN,
        flow_id: entry.flow_id,
        flow_digest: entry.digest,
      },
    ]),
  });
}

async function installFlow(
  studio: MemoryStudioPersistence,
  entry: FlowIndexEntry,
): Promise<void> {
  const snapshot = await studio.getSpaceIndexSnapshot(SPACE);
  await studio.replaceSpaceIndex(SPACE, {
    ...snapshot,
    flows: [{ ...entry, payload_json: JSON.stringify(entry) }],
  });
}

function makeDeps(studio: MemoryStudioPersistence, guard: SpaceConcurrencyGuard): FlowRunServiceDeps {
  let counter = 0;
  return {
    studio,
    handler: { appendSpaceJournal: vi.fn(async () => ({ seq: 1, entry_id: "evt" })) } as unknown as HubHandler,
    ids: { ulid: () => `id${++counter}` },
    clock: { nowIso: () => NOW },
    guard,
  };
}

function start(deps: FlowRunServiceDeps, entry: FlowIndexEntry) {
  return startFlowRun(deps, {
    entry,
    space_id: ORIGIN,
    actor_id: "actor_alice",
    token_id: "tok_1",
    capabilities: ["flow:run"],
    mode: "manual",
    input: {},
  });
}

describe("run-capacity atomic races via startFlowRun", () => {
  test("limit 1: N concurrent starts admit exactly one, deny the rest; no partial run", async () => {
    const studio = await freshStudio();
    const guard = new SpaceConcurrencyGuard();
    const entry = makeEntry("flw_one", "one");
    await installPolicy(studio, entry, 1);
    const deps = makeDeps(studio, guard);

    const results = await Promise.all(Array.from({ length: 5 }, () => start(deps, entry)));
    const ok = results.filter((r) => r.ok);
    const denied = results.filter((r) => !r.ok);

    expect(ok).toHaveLength(1);
    expect(denied).toHaveLength(4);
    for (const r of denied) {
      if (!r.ok) {
        expect(r.error.code).toBe(FLOW_CONCURRENCY_LIMIT);
        expect(r.error.max_concurrent_runs).toBe(1);
        expect(r.error.active_run_ids).toHaveLength(1);
        expect(r.error.active_run_ids?.[0]).toMatch(/^run_/);
      }
    }

    // Overflow creates no queued/partial run: exactly one run row exists.
    const runs = await studio.listRuns({ space_id: SPACE, flow_id: entry.flow_id });
    expect(runs).toHaveLength(1);
    // Admitted run is pinned to the applied flow digest.
    if (ok[0]?.ok) expect(ok[0].flow_digest).toBe(entry.digest);
  });

  test("no policy: concurrent starts all admit (unbounded stays concurrent)", async () => {
    const studio = await freshStudio();
    const guard = new SpaceConcurrencyGuard();
    const entry = makeEntry("flw_free", "free");
    await installFlow(studio, entry);
    const deps = makeDeps(studio, guard);

    const results = await Promise.all(Array.from({ length: 4 }, () => start(deps, entry)));
    expect(results.every((r) => r.ok)).toBe(true);
    const runs = await studio.listRuns({ space_id: SPACE, flow_id: entry.flow_id });
    expect(runs).toHaveLength(4);
  });

  test("limit 2: exactly two admit, the rest deny (exact boundary)", async () => {
    const studio = await freshStudio();
    const guard = new SpaceConcurrencyGuard();
    const entry = makeEntry("flw_two", "two");
    await installPolicy(studio, entry, 2);
    const deps = makeDeps(studio, guard);

    const results = await Promise.all(Array.from({ length: 4 }, () => start(deps, entry)));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok)).toHaveLength(2);
    const runs = await studio.listRuns({ space_id: SPACE, flow_id: entry.flow_id });
    expect(runs).toHaveLength(2);
  });

  test("retry after termination performs a fresh admission check and succeeds", async () => {
    const studio = await freshStudio();
    const guard = new SpaceConcurrencyGuard();
    const entry = makeEntry("flw_retry", "retry");
    await installPolicy(studio, entry, 1);
    const deps = makeDeps(studio, guard);

    const first = await start(deps, entry);
    expect(first.ok).toBe(true);
    // A second concurrent-style start while the first is non-terminal is denied.
    const second = await start(deps, entry);
    expect(second.ok).toBe(false);

    // Terminate the admitted run; the next start must succeed (fresh check).
    const runs = await studio.listRuns({ space_id: SPACE, flow_id: entry.flow_id });
    await studio.updateRunLifecycle(runs[0]!.run_id, "completed", NOW);

    const third = await start(deps, entry);
    expect(third.ok).toBe(true);
  });

  test("start queued behind apply resolves the newly committed flow digest", async () => {
    const studio = await freshStudio();
    const guard = new SpaceConcurrencyGuard();
    const oldEntry = makeEntry("flw_refresh", "refresh");
    await installFlow(studio, oldEntry);
    const newEntry = { ...oldEntry, digest: "sha256:refresh-v2" };
    const deps = makeDeps(studio, guard);

    const applyWon = guard.with(ORIGIN, async () => {
      const snapshot = await studio.getSpaceIndexSnapshot(SPACE);
      await studio.replaceSpaceIndex(SPACE, {
        ...snapshot,
        flows: [{ ...newEntry, payload_json: JSON.stringify(newEntry) }],
      });
    });
    const started = start(deps, oldEntry);

    await applyWon;
    const result = await started;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.flow_digest).toBe(newEntry.digest);
      const run = await studio.getRun(result.run_id);
      expect(run?.flow_digest).toBe(newEntry.digest);
    }
  });

  test("headless run (flow_id null) bypasses capacity but still holds the guard", async () => {
    const studio = await freshStudio();
    const guard = new SpaceConcurrencyGuard();
    // Install a policy on a flow; headless invoke has no flow_id and is unlimited.
    const entry = makeEntry("flw_headless", "headless");
    await installPolicy(studio, entry, 1);
    const deps = makeDeps(studio, guard);

    // Insert a session first (headless runs reuse an existing session).
    await studio.insertSession(
      {
        session_id: "headless",
        title: "headless",
        status: "active",
        created_by: { type: "actor", actor_id: "actor_alice" },
        spaces_touched: [SPACE],
        actor_id: "actor_alice",
        cancel_requested_at: undefined,
      },
      NOW,
    );

    const { admitAndCreateRun } = await import("../../../src/run/service.js");
    let releaseGuard!: () => void;
    let markEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const held = guard.with(ORIGIN, async () => {
      markEntered();
      await new Promise<void>((resolve) => {
        releaseGuard = resolve;
      });
    });
    await entered;

    let settled = false;
    const pending = admitAndCreateRun(deps, {
      session_id: "ses_headless",
      space_id: ORIGIN,
      flow_id: null,
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["action:invoke"],
    }).then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    releaseGuard();
    await held;
    const r1 = await pending;
    expect("run" in r1).toBe(true);

    const r2 = await admitAndCreateRun(deps, {
      session_id: "ses_headless",
      space_id: ORIGIN,
      flow_id: null,
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["action:invoke"],
    });
    expect("run" in r2).toBe(true);
  });
});
