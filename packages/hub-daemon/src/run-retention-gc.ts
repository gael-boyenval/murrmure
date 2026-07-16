import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import {
  directoryBytes,
  removeTree,
  sweepRunRetention,
  type RunRetentionDeps,
} from "@murrmure/hub-core";
import { resolveSpaceRoot } from "@murrmure/hub-core";
import { bareSpaceId } from "./space-id.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build the retention sweep dependencies from the hub persistence port. Each
 * run is projected to `{ run_id, space_id, lifecycle, ended_at }` — no
 * exec_context or artifact manifests are loaded into memory for the sweep. The
 * space root is resolved from local space bindings; runs whose space has no
 * local root (e.g. federated-only) are skipped without touching disk.
 */
export function createRunRetentionDeps(
  persistence: StudioPersistencePort,
): RunRetentionDeps {
  return {
    async listRuns() {
      const rows = await persistence.listRuns();
      return rows.map((row) => ({
        run_id: row.run_id,
        space_id: row.space_id,
        lifecycle: row.lifecycle,
        ended_at: row.ended_at,
      }));
    },
    async resolveSpaceRoot(space_id) {
      const bindings = await persistence.getSpaceBindings(bareSpaceId(space_id));
      return resolveSpaceRoot(bindings);
    },
    removeTree,
    directoryBytes,
  };
}

/**
 * Register the run-retention GC: one sweep at startup and every 24 hours. The
 * sanitized summary (counts and freed bytes only — no run ids or host paths) is
 * logged so operators and support can observe retention without leaking local
 * filesystem detail. The interval is `unref`'d so it never keeps the daemon
 * alive on its own. Returns a stop function for shutdown.
 */
export function registerRunRetentionGc(
  deps: RunRetentionDeps,
  opts: { now?: () => Date; log?: (line: string) => void } = {},
): () => void {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => undefined);

  const sweep = () =>
    sweepRunRetention(deps, now())
      .then((s) => {
        log(
          `[murrmure] run retention sweep: swept=${s.swept} bytes_freed=${s.bytes_freed} active=${s.skipped_active} not_eligible=${s.skipped_not_eligible} no_root=${s.skipped_no_root} errors=${s.errors}`,
        );
      })
      .catch(() => undefined);

  // Startup sweep: headless runs that need reconciliation are never 7 days
  // terminal, and active runs are immune by classification, so this is safe to
  // run before `reconcileHeadlessRuns` settles.
  void sweep();

  const timer = setInterval(() => {
    void sweep();
  }, DAY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
