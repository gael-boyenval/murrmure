import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DAY_MS,
  RUN_RETENTION_DAYS,
  directoryBytes,
  isRetentionEligible,
  removeTree,
  sweepRunRetention,
  type RunRetentionDeps,
  type RunRetentionRun,
} from "../../../src/flow-engine/run-retention.js";
import { runScratchDir, spaceRunsDir } from "../../../src/flow-engine/run-scratch-paths.js";

const SPACE_ID = "spc_test";
const DAY = DAY_MS;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Build real-fs deps with stubbed persistence projection. */
function makeDeps(
  runs: RunRetentionRun[],
  rootsBySpace: Record<string, string>,
  opts: { removeTree?: RunRetentionDeps["removeTree"] } = {},
): RunRetentionDeps {
  return {
    async listRuns() {
      return runs;
    },
    async resolveSpaceRoot(space_id) {
      return rootsBySpace[space_id];
    },
    removeTree: opts.removeTree ?? removeTree,
    directoryBytes,
  };
}

/** Create a run-scratch tree with one byte file so it has measurable bytes. */
function seedRunTree(spaceRoot: string, run_id: string, bytes = 64): string {
  const runDir = runScratchDir(spaceRoot, run_id);
  mkdirSync(join(runDir, "steps", "intake", "spec"), { recursive: true });
  writeFileSync(join(runDir, "steps", "intake", "spec", "hero.md"), Buffer.alloc(bytes, 0x61));
  return runDir;
}

describe("flow-engine/run-retention — eligibility", () => {
  test("terminal run is eligible exactly at ended_at + 7 days, not one ms earlier", () => {
    const ended = 1_000_000;
    const run = { lifecycle: "completed" as const, ended_at: iso(ended) };
    expect(isRetentionEligible(run, new Date(ended + RUN_RETENTION_DAYS * DAY))).toBe(true);
    expect(isRetentionEligible(run, new Date(ended + RUN_RETENTION_DAYS * DAY - 1))).toBe(false);
  });

  test("active runs and missing ended_at are never eligible", () => {
    expect(isRetentionEligible({ lifecycle: "working", ended_at: iso(0) }, new Date(1e12))).toBe(false);
    expect(isRetentionEligible({ lifecycle: "input-required", ended_at: iso(0) }, new Date(1e12))).toBe(false);
    expect(isRetentionEligible({ lifecycle: "completed" }, new Date(1e12))).toBe(false);
    expect(isRetentionEligible({ lifecycle: "failed", ended_at: "not-a-date" }, new Date(1e12))).toBe(false);
  });
});

describe("flow-engine/run-retention — sweep", () => {
  let spaceRoot: string;

  beforeEach(() => {
    spaceRoot = mkdtempSync(join(tmpdir(), "run-retention-"));
  });
  afterEach(() => {
    rmSync(spaceRoot, { recursive: true, force: true });
  });

  test("sweeps a terminal run past 7 days and frees bytes", async () => {
    const ended = Date.now() - (RUN_RETENTION_DAYS + 1) * DAY;
    seedRunTree(spaceRoot, "run_OLD", 64);
    const deps = makeDeps(
      [{ run_id: "run_OLD", space_id: SPACE_ID, lifecycle: "completed", ended_at: iso(ended) }],
      { [SPACE_ID]: spaceRoot },
    );
    const now = new Date();
    const summary = await sweepRunRetention(deps, now);
    expect(summary.swept).toBe(1);
    expect(summary.bytes_freed).toBeGreaterThanOrEqual(64);
    expect(summary.skipped_active).toBe(0);
    expect(existsSync(runScratchDir(spaceRoot, "run_OLD"))).toBe(false);
  });

  test("active run is immune — its tree survives", async () => {
    seedRunTree(spaceRoot, "run_ACTIVE", 32);
    const deps = makeDeps(
      [{ run_id: "run_ACTIVE", space_id: SPACE_ID, lifecycle: "working", ended_at: iso(Date.now()) }],
      { [SPACE_ID]: spaceRoot },
    );
    const summary = await sweepRunRetention(deps, new Date(Date.now() + 365 * DAY));
    expect(summary.skipped_active).toBe(1);
    expect(summary.swept).toBe(0);
    expect(existsSync(runScratchDir(spaceRoot, "run_ACTIVE"))).toBe(true);
  });

  test("terminal run inside the 7-day window is retained", async () => {
    seedRunTree(spaceRoot, "run_FRESH", 32);
    const ended = Date.now() - 2 * DAY;
    const deps = makeDeps(
      [{ run_id: "run_FRESH", space_id: SPACE_ID, lifecycle: "completed", ended_at: iso(ended) }],
      { [SPACE_ID]: spaceRoot },
    );
    const summary = await sweepRunRetention(deps, new Date());
    expect(summary.skipped_not_eligible).toBe(1);
    expect(summary.swept).toBe(0);
    expect(existsSync(runScratchDir(spaceRoot, "run_FRESH"))).toBe(true);
  });

  test("terminal run with no local root is skipped (tree left alone)", async () => {
    seedRunTree(spaceRoot, "run_NOROOT", 32);
    const ended = Date.now() - (RUN_RETENTION_DAYS + 1) * DAY;
    const deps = makeDeps(
      [{ run_id: "run_NOROOT", space_id: "spc_fed", lifecycle: "completed", ended_at: iso(ended) }],
      { spc_fed: spaceRoot },
    );
    // Space resolves to no local root (federated-only).
    const summary = await sweepRunRetention(
      { ...deps, async resolveSpaceRoot() {
        return undefined;
      } },
      new Date(),
    );
    expect(summary.skipped_no_root).toBe(1);
    expect(summary.swept).toBe(0);
    expect(existsSync(runScratchDir(spaceRoot, "run_NOROOT"))).toBe(true);
  });

  test("partial failure is tolerated: one error does not abort the pass", async () => {
    seedRunTree(spaceRoot, "run_GOOD", 16);
    seedRunTree(spaceRoot, "run_BAD", 16);
    const ended = Date.now() - (RUN_RETENTION_DAYS + 1) * DAY;
    let calls = 0;
    const failingRemove: RunRetentionDeps["removeTree"] = async (path) => {
      calls++;
      if (path.endsWith("run_BAD") || join(path).includes("run_BAD")) {
        throw new Error("boom");
      }
      await removeTree(path);
    };
    const deps = makeDeps(
      [
        { run_id: "run_BAD", space_id: SPACE_ID, lifecycle: "failed", ended_at: iso(ended) },
        { run_id: "run_GOOD", space_id: SPACE_ID, lifecycle: "completed", ended_at: iso(ended) },
      ],
      { [SPACE_ID]: spaceRoot },
      { removeTree: failingRemove },
    );
    const summary = await sweepRunRetention(deps, new Date());
    expect(summary.errors).toBe(1);
    expect(summary.swept).toBe(1);
    expect(existsSync(runScratchDir(spaceRoot, "run_GOOD"))).toBe(false);
  });

  test("preserves global artifact manifest/inbox bytes outside the run tree", async () => {
    const ended = Date.now() - (RUN_RETENTION_DAYS + 1) * DAY;
    seedRunTree(spaceRoot, "run_OLD", 64);
    // Global artifact exchange inbox lives under .mrmr/dev/inbox (not per-run),
    // and the per-space runs root itself is outside any one run tree.
    const inboxFile = join(spaceRoot, ".mrmr", "dev", "inbox", "xfr_01", "openapi.diff");
    mkdirSync(join(spaceRoot, ".mrmr", "dev", "inbox", "xfr_01"), { recursive: true });
    writeFileSync(inboxFile, Buffer.from("diff --git\n"));
    const deps = makeDeps(
      [{ run_id: "run_OLD", space_id: SPACE_ID, lifecycle: "completed", ended_at: iso(ended) }],
      { [SPACE_ID]: spaceRoot },
    );
    await sweepRunRetention(deps, new Date());
    expect(existsSync(inboxFile)).toBe(true);
    expect(existsSync(spaceRunsDir(spaceRoot))).toBe(true);
  });

  test("sanitized summary leaks no run id or host path", async () => {
    const ended = Date.now() - (RUN_RETENTION_DAYS + 1) * DAY;
    seedRunTree(spaceRoot, "run_SECRET", 8);
    const deps = makeDeps(
      [{ run_id: "run_SECRET", space_id: SPACE_ID, lifecycle: "completed", ended_at: iso(ended) }],
      { [SPACE_ID]: spaceRoot },
    );
    const summary = await sweepRunRetention(deps, new Date());
    const blob = JSON.stringify(summary);
    expect(blob).not.toContain("run_SECRET");
    expect(blob).not.toContain(spaceRoot);
    expect(blob).not.toContain(SPACE_ID);
  });
});
