import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { addSpaceId } from "../bridge/ids.js";
import type { HubHandler } from "../handlers/hub.js";
import { failRunWithNotification, type SessionRunDeps } from "../run/service.js";
import {
  defaultExecutorTimeoutScheduler,
  formatActionTimedOutSummary,
} from "./timeout-scheduler.js";

export async function sweepExecutorTimeouts(
  deps: SessionRunDeps & { handler: HubHandler },
  input?: {
    now?: number;
    actor_id?: string;
    token_id?: string;
  },
): Promise<number> {
  const expired = defaultExecutorTimeoutScheduler.collectExpired(input?.now);
  if (expired.length === 0) return 0;

  const actor_id = input?.actor_id ?? "system_flow";
  const token_id = input?.token_id ?? "system";

  for (const item of expired) {
    defaultExecutorTimeoutScheduler.stop(item.run_id, item.step_id);
    const runBare = item.run_id.startsWith("run_") ? item.run_id.slice(4) : item.run_id;
    const run = await deps.studio.getRun(runBare);
    if (!run?.space_id) continue;

    const summary = formatActionTimedOutSummary({
      step_id: item.step_id,
      action_name: item.action_name,
      timeout_ms: item.timeout_ms,
      human_wait_excluded: true,
    });

    await deps.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.ACTION_TIMED_OUT,
      space_id: addSpaceId(run.space_id),
      session_id: run.session_id ? `ses_${run.session_id}` : undefined,
      run_id: item.run_id.startsWith("run_") ? item.run_id : `run_${item.run_id}`,
      actor_id,
      token_id,
      data: {
        step_id: item.step_id,
        action_name: item.action_name,
        error_code: "ACTION_TIMED_OUT",
        detail: summary,
      },
    });

    await failRunWithNotification(deps, {
      run_id: item.run_id,
      actor_id,
      token_id,
      reason: `ACTION_TIMED_OUT:${summary}`,
    });
  }

  return expired.length;
}

export function startExecutorTimeoutSweep(
  deps: SessionRunDeps & { handler: HubHandler },
  intervalMs = 5_000,
): () => void {
  const timer = setInterval(() => {
    void sweepExecutorTimeouts(deps).catch(() => undefined);
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
