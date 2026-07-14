import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { ViewContractError } from "@murrmure/view-sdk";
import type { RunDetailPayload, ShellClient } from "@murrmure/shell-client";
import { ViewCanvasHost } from "../components/ViewCanvasHost.js";
import { buildViewAppContextFromRun } from "../lib/view-app-context.js";
import { mapBranchSubmitToResolveStep, mapCancelToResolveStep } from "../lib/view-resolve-adapter.js";
import { shouldShowStepCanvas, viewRefFromActiveStep } from "../lib/step-view-binding.js";
import { getStoredHubUrl } from "../hooks.js";

type Ack = { ok: true } | { ok: false; error: ViewContractError };

export interface StepCanvasBindingInput {
  client: ShellClient;
  run: RunDetailPayload;
  flow_id: string;
  space_id: string;
  title: string;
  adminHref?: string;
  /** Where to navigate after closing or resolving a checkpoint view. */
  closeHref?: string;
}

export function useStepCanvasBinding(input: StepCanvasBindingInput | null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const client = input?.client;
  const run = input?.run;
  const flowId = input?.flow_id;
  const spaceId = input?.space_id;
  const title = input?.title;
  const adminHref = input?.adminHref;
  const closeHref = input?.closeHref;

  const runId = run?.run_id;
  const sessionId = run?.session_id;
  const stepId = run?.open_steps?.[0]?.step_id;
  const showCanvas = run ? shouldShowStepCanvas(run) : false;
  const viewRef = viewRefFromActiveStep(run?.open_steps?.[0]);

  const context = useMemo(() => {
    if (!run || !showCanvas || !flowId || !spaceId) return null;
    return buildViewAppContextFromRun(run, {
      hub_base_url: getStoredHubUrl(),
      flow_id: flowId,
      space_id: spaceId,
    });
  }, [run, showCanvas, flowId, spaceId, runId, stepId]);

  const invalidate = useCallback(async () => {
    if (!runId) return;
    await queryClient.invalidateQueries({ queryKey: ["run", runId] });
    await queryClient.invalidateQueries({ queryKey: ["run-graph", runId] });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["space-home"] });
    if (sessionId) {
      await queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
      await queryClient.invalidateQueries({ queryKey: ["session-runs", sessionId] });
    }
  }, [queryClient, runId, sessionId]);

  const closeCheckpoint = useCallback(async () => {
    await invalidate();
    if (closeHref) {
      navigate(closeHref);
      return;
    }
    if (runId) {
      navigate(`/runs/${runId}`);
      return;
    }
    if (sessionId) {
      navigate(`/sessions/${sessionId}`);
    }
  }, [invalidate, navigate, closeHref, runId, sessionId]);

  const onSubmitBranch = useCallback(
    async (branch: string, params: Record<string, unknown>): Promise<Ack> => {
      if (!client || !runId || !stepId) {
        return { ok: false, error: { code: "VIEW_CONTEXT_MISMATCH", message: "No active step to resolve" } };
      }
      try {
        const body = mapBranchSubmitToResolveStep(branch, params);
        await client.runs.resolveStep(runId, stepId, body);
        await closeCheckpoint();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "VIEW_BRANCH_VALIDATION_FAILED",
            message: err instanceof Error ? err.message : "Host rejected submit",
            branch,
          },
        };
      }
    },
    [client, runId, stepId, closeCheckpoint],
  );

  const onCancel = useCallback(async (): Promise<Ack> => {
    if (!client || !runId || !stepId) {
      return { ok: false, error: { code: "VIEW_CANCEL_REJECTED", message: "No active step to cancel" } };
    }
    try {
      const body = mapCancelToResolveStep();
      await client.runs.resolveStep(runId, stepId, body);
      await closeCheckpoint();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: { code: "VIEW_CANCEL_REJECTED", message: err instanceof Error ? err.message : "Host rejected cancel" },
      };
    }
  }, [client, runId, stepId, closeCheckpoint]);

  const onResolved = closeCheckpoint;

  const canvas =
    showCanvas && context && title ? (
      <ViewCanvasHost
        title={title}
        viewRef={viewRef}
        context={context}
        onSubmitBranch={onSubmitBranch}
        onCancel={onCancel}
        onResolved={onResolved}
        adminHref={adminHref}
        homeHref={closeHref ?? (runId ? `/runs/${runId}` : sessionId ? `/sessions/${sessionId}` : undefined)}
        homeLabel="Back to flow"
      />
    ) : null;

  return { showCanvas, canvas, onSubmitBranch, onCancel, onResolved, context };
}
