import { useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ViewBranchSubmitInput,
  ViewContractError,
  ViewSubmissionState,
} from "@murrmure/view-sdk";
import { viewSubmitFileName } from "@murrmure/view-sdk";
import type { RunDetailPayload, ShellClient } from "@murrmure/shell-client";
import { ShellClientHttpError } from "@murrmure/shell-client";
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
  const submissions = useRef(new Map<string, { controller: AbortController; intent_id?: string }>());

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
    async (
      branch: string,
      viewInput: ViewBranchSubmitInput,
      submission: { submission_id: string; report: (state: ViewSubmissionState) => void },
    ): Promise<Ack> => {
      if (!client || !runId || !stepId) {
        return { ok: false, error: { code: "VIEW_CONTEXT_MISMATCH", message: "No active step to resolve", errors: [] } };
      }
      const controller = new AbortController();
      const active = { controller, intent_id: undefined as string | undefined };
      submissions.current.set(submission.submission_id, active);
      try {
        const branchContract = context?.step?.branches.find((candidate) => candidate.branch === branch);
        if (!branchContract) {
          return { ok: false, error: { code: "VIEW_UNKNOWN_BRANCH", message: `Unknown branch '${branch}'`, branch, errors: [] } };
        }
        const files = Object.entries(viewInput.files ?? {}).flatMap(([slot, value]) =>
          (Array.isArray(value) ? value : [value]).map((file, index) => ({
            slot,
            file,
            name: viewSubmitFileName(branchContract, slot, file, index),
          })),
        );
        const totalBytes = files.reduce((sum, item) => sum + item.file.size, 0);
        submission.report({ status: "validating", uploadedBytes: 0, totalBytes });
        if (files.length === 0) {
          const body = mapBranchSubmitToResolveStep(branch, viewInput.payload ?? {});
          const request = {
            ...body,
            idempotency_key: submission.submission_id,
          };
          try {
            await client.runs.resolveStep(runId, stepId, request);
          } catch (error) {
            if (controller.signal.aborted || error instanceof ShellClientHttpError) throw error;
            await client.runs.resolveStep(runId, stepId, request);
          }
          submission.report({ status: "succeeded", uploadedBytes: 0, totalBytes: 0 });
          await closeCheckpoint();
          return { ok: true };
        }
        const intent = await client.runs.createUploadIntent(runId, stepId, {
          branch,
          payload: viewInput.payload,
          files: files.map((item) => ({
            slot: item.slot,
            name: item.name,
            media_type: item.file.type,
            size_bytes: item.file.size,
          })),
          idempotency_key: submission.submission_id,
        });
        active.intent_id = intent.intent_id;
        let completedBytes = 0;
        let reportedBytes = 0;
        submission.report({ status: "uploading", uploadedBytes: 0, totalBytes });
        for (let index = 0; index < files.length; index += 1) {
          const item = files[index]!;
          await client.runs.uploadIntentFile(intent.intent_id, index, item.file, {
            signal: controller.signal,
            onProgress: (loaded) => {
              reportedBytes = Math.max(reportedBytes, completedBytes + loaded);
              submission.report({
                status: "uploading",
                uploadedBytes: Math.min(reportedBytes, totalBytes),
                totalBytes,
              });
            },
          });
          completedBytes += item.file.size;
          reportedBytes = Math.max(reportedBytes, completedBytes);
          submission.report({ status: "uploading", uploadedBytes: reportedBytes, totalBytes });
        }
        submission.report({ status: "resolving", uploadedBytes: totalBytes, totalBytes });
        const request = {
          branch,
          payload: viewInput.payload,
          upload_intent_id: intent.intent_id,
          idempotency_key: submission.submission_id,
        };
        try {
          await client.runs.resolveStep(runId, stepId, request);
        } catch (error) {
          if (controller.signal.aborted || error instanceof ShellClientHttpError) throw error;
          await client.runs.resolveStep(runId, stepId, request);
        }
        submission.report({ status: "succeeded", uploadedBytes: totalBytes, totalBytes });
        await closeCheckpoint();
        return { ok: true };
      } catch (err) {
        if (active.intent_id) {
          await client.runs.cancelUploadIntent(active.intent_id).catch(() => undefined);
        }
        const cancelled = controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError");
        const body =
          err && typeof err === "object" && "body" in err
            ? (err as { body?: { code?: string; message?: string; errors?: ViewContractError["errors"] } }).body
            : undefined;
        return {
          ok: false,
          error: {
            code: cancelled ? "VIEW_SUBMISSION_CANCELLED" : body?.code ?? "VIEW_BRANCH_VALIDATION_FAILED",
            message: cancelled ? "Submission cancelled" : body?.message ?? (err instanceof Error ? err.message : "Host rejected submit"),
            branch,
            errors: body?.errors ?? [],
          },
        };
      } finally {
        submissions.current.delete(submission.submission_id);
      }
    },
    [client, runId, stepId, closeCheckpoint, context],
  );

  const onCancelSubmission = useCallback(async (submissionId: string) => {
    const active = submissions.current.get(submissionId);
    if (!active) return;
    active.controller.abort();
    if (client && active.intent_id) {
      await client.runs.cancelUploadIntent(active.intent_id).catch(() => undefined);
    }
  }, [client]);

  const onCancel = useCallback(async (): Promise<Ack> => {
    if (!client || !runId || !stepId) {
      return { ok: false, error: { code: "VIEW_CANCEL_REJECTED", message: "No active step to cancel", errors: [] } };
    }
    try {
      const body = mapCancelToResolveStep();
      await client.runs.resolveStep(runId, stepId, body);
      await closeCheckpoint();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: { code: "VIEW_CANCEL_REJECTED", message: err instanceof Error ? err.message : "Host rejected cancel", errors: [] },
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
        onCancelSubmission={onCancelSubmission}
        onCancel={onCancel}
        onResolved={onResolved}
        adminHref={adminHref}
        homeHref={closeHref ?? (runId ? `/runs/${runId}` : sessionId ? `/sessions/${sessionId}` : undefined)}
        homeLabel="Back to flow"
      />
    ) : null;

  return { showCanvas, canvas, onSubmitBranch, onCancelSubmission, onCancel, onResolved, context };
}
