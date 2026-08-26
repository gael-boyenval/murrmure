import { ShellClientHttpError } from "@murrmure/shell-client";

export const DIRECTIVE_FLOW_ID = "flw_mrmr_directive";

export const TERMINAL_RUN_LIFECYCLES = new Set(["completed", "failed", "cancelled"]);

export function isTerminalRunLifecycle(lifecycle: string): boolean {
  return TERMINAL_RUN_LIFECYCLES.has(lifecycle);
}

export function toggleSpaceId(selected: Set<string>, spaceId: string): Set<string> {
  const next = new Set(selected);
  if (next.has(spaceId)) next.delete(spaceId);
  else next.add(spaceId);
  return next;
}

export function setEligibleSpaces(selected: Set<string>, eligibleIds: string[], on: boolean): Set<string> {
  const eligible = new Set(eligibleIds);
  const next = new Set([...selected].filter((id) => !eligible.has(id)));
  if (on) {
    for (const id of eligibleIds) next.add(id);
  }
  return next;
}

export function eligibleSelectionState(
  selected: Set<string>,
  eligibleIds: string[],
): boolean | "indeterminate" {
  if (eligibleIds.length === 0) return false;
  let n = 0;
  for (const id of eligibleIds) {
    if (selected.has(id)) n += 1;
  }
  if (n === 0) return false;
  if (n === eligibleIds.length) return true;
  return "indeterminate";
}

export function runResultMessage(run: {
  result?: { message?: string };
  exec_context?: Record<string, unknown>;
}): string | undefined {
  if (typeof run.result?.message === "string") return run.result.message;
  const steps = run.exec_context?.steps;
  if (!steps || typeof steps !== "object" || Array.isArray(steps)) return undefined;
  const execute = (steps as Record<string, { output?: { message?: unknown } }>).execute;
  return typeof execute?.output?.message === "string" ? execute.output.message : undefined;
}

export type DirectiveStartRow =
  | { space_id: string; ok: true; run_id: string; session_id: string }
  | { space_id: string; ok: false; error: string };

export async function startDirectiveRuns(input: {
  runFlow: (flow_id: string, body: { space_id?: string; input?: Record<string, unknown> }) => Promise<{
    session: { session_id: string };
    run_id: string;
  }>;
  prompt: string;
  spaceIds: string[];
}): Promise<DirectiveStartRow[]> {
  const prompt = input.prompt.trim();
  const settled = await Promise.allSettled(
    input.spaceIds.map((space_id) =>
      input.runFlow(DIRECTIVE_FLOW_ID, { space_id, input: { prompt } }),
    ),
  );
  return settled.map((result, index) => {
    const space_id = input.spaceIds[index] ?? "";
    if (result.status === "fulfilled") {
      return {
        space_id,
        ok: true as const,
        run_id: result.value.run_id,
        session_id: result.value.session.session_id,
      };
    }
    const err = result.reason;
    const error =
      err instanceof ShellClientHttpError
        ? err.message || `Could not start directive (${err.status})`
        : err instanceof Error
          ? err.message
          : "Could not start directive";
    return { space_id, ok: false as const, error };
  });
}
