import type { RunDetailPayload } from "@murrmure/shell-client";
import type { ViewRefLike } from "./view-app-context.js";

type OpenStep = NonNullable<RunDetailPayload["open_steps"]>[number];

export function activeOpenStepFromRun(run: RunDetailPayload | undefined): OpenStep | undefined {
  return run?.open_steps?.[0];
}

// View binding is introduced in a later slice. Open steps in the
// resolver-agnostic contract carry no view identity, so no view ref is derived.
export function viewRefFromActiveStep(_active: OpenStep | undefined): ViewRefLike | undefined {
  return undefined;
}

export function shouldShowStepCanvas(_run: RunDetailPayload | undefined): boolean {
  return false;
}
