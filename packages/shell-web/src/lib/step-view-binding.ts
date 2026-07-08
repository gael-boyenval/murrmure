import type { RunDetailPayload } from "@murrmure/shell-client";
import type { ViewRefLike } from "./view-app-context.js";

export function activeHumanStepFromRun(
  run: RunDetailPayload | undefined,
): RunDetailPayload["active_human_step"] | undefined {
  return run?.active_human_step;
}

export function viewRefFromActiveStep(
  active: RunDetailPayload["active_human_step"],
): ViewRefLike | undefined {
  if (!active?.view_ref) return undefined;
  return {
    view_id: active.view_ref.view_id,
    origin_space_id: active.view_ref.origin_space_id,
    entry_url: active.view_ref.entry_url,
    shell_route: active.view_ref.shell_route,
  };
}

export function shouldShowStepCanvas(run: RunDetailPayload | undefined): boolean {
  const active = activeHumanStepFromRun(run);
  return Boolean(active?.view_ref?.view_id || active?.view_ref?.shell_route);
}
