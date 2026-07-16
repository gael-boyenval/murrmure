import type { RunDetailPayload } from "@murrmure/shell-client";
import type { ViewRefLike } from "./view-app-context.js";

type OpenStep = NonNullable<RunDetailPayload["open_steps"]>[number];

export function activeOpenStepFromRun(run: RunDetailPayload | undefined): OpenStep | undefined {
  return run?.open_steps?.[0];
}

/**
 * Derive the inline View reference projected by the hub for a `view_resolver`
 * open step. The shell performs no client-side handler matching — it consumes
 * the sanitized, authorized projection verbatim. Returns `undefined` when no
 * view is bound (the shell stays observability-only and must not synthesize a
 * fallback form).
 */
export function viewRefFromActiveStep(active: OpenStep | undefined): ViewRefLike | undefined {
  if (!active?.view) return undefined;
  const view = active.view;
  return {
    view_id: view.view_id,
    origin_space_id: view.origin_space_id,
    entry_url: view.entry,
    shell_route: view.shell_route,
  };
}

/**
 * True only when the hub projected a `view_resolver` with an inline View ref on
 * the active open step. Unbound steps stay observability-only.
 */
export function shouldShowStepCanvas(run: RunDetailPayload | undefined): boolean {
  const active = activeOpenStepFromRun(run);
  return Boolean(active?.resolver?.type === "view_resolver" && active?.view);
}
