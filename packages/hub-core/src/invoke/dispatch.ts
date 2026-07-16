import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { DispatchOutcome, DispatchStatus, InvokeRequest } from "@murrmure/runtime-contracts";
import { buildHeadlessStepId, buildInvokeIdempotencyKey } from "./idempotency.js";
import { journalInvokeLifecycle, buildInvokeResponse } from "./completion.js";
import { runInvokePreflight } from "./preflight.js";
import {
  buildSpaceJournalEnvelope,
  InlinePayloadExceededError,
  validateJournalInlinePayload,
} from "../journal/append.js";
import type { InvokeOrchestratorDeps, ResolvedInvoke } from "./types.js";
import type { ExecutorTimeoutScheduler } from "../executors/timeout-scheduler.js";
import { defaultExecutorTimeoutScheduler } from "../executors/timeout-scheduler.js";

export interface InvokeActor {
  actor_id: string;
  token_id: string;
}

export interface OrchestrateInvokeOptions {
  /** Skip idempotency memo lookup (e.g. when draining a queued invoke). */
  skipMemoLookup?: boolean;
  executorTimeoutScheduler?: ExecutorTimeoutScheduler;
  /** Persist resolved shell command/prompt (e.g. into run exec_context). */
  onDispatchAudit?: (input: {
    run_id: string;
    step_id: string;
    audit: import("@murrmure/runtime-contracts").DispatchAudit;
  }) => void | Promise<void>;
}

/** Terminal for idempotent retry — prevents duplicate journal/MCP publish on redispatch. */
function isMemoizableForRetry(status: DispatchStatus): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "dispatched" ||
    status === "queued"
  );
}

function shouldMemoizeOutcome(outcome: DispatchOutcome): boolean {
  return isMemoizableForRetry(outcome.status);
}

function withIdempotencyKey(
  data: Record<string, unknown>,
  idempotencyKey: string | null,
): Record<string, unknown> {
  return idempotencyKey ? { ...data, idempotency_key: idempotencyKey } : data;
}

function invokeResultExceedsInlineCap(input: {
  type: string;
  space_id: string;
  session_id?: string;
  run_id?: string;
  action_name: string;
  step_id: string;
  actor_id: string;
  result?: Record<string, unknown>;
}): boolean {
  try {
    validateJournalInlinePayload(
      buildSpaceJournalEnvelope({
        space_id: input.space_id,
        type: input.type,
        actor_id: input.actor_id,
        session_id: input.session_id,
        run_id: input.run_id,
        data: {
          action_name: input.action_name,
          step_id: input.step_id,
          result: input.result,
        },
        eventId: "evt_01JINLINEPAYLOADPRECHECK00",
        ts: "2026-01-01T00:00:00.000Z",
      }),
    );
    return false;
  } catch (error) {
    return error instanceof InlinePayloadExceededError;
  }
}

export async function orchestrateInvoke(
  resolved: ResolvedInvoke,
  request: InvokeRequest,
  actor: InvokeActor,
  deps: InvokeOrchestratorDeps,
  options?: OrchestrateInvokeOptions,
) {
  const step_id = buildHeadlessStepId(request.action_name, request.step_id);
  const idempotencyKey = buildInvokeIdempotencyKey({
    header: request.idempotency_key,
    run_id: request.run_id,
    step_id,
    action: resolved.action,
  });

  if (idempotencyKey && !options?.skipMemoLookup) {
    const memo = await Promise.resolve(deps.memoStore.get(idempotencyKey));
    if (memo && shouldMemoizeOutcome(memo)) {
      return buildInvokeResponse({ ...memo, step_id: memo.step_id ?? step_id });
    }
  }

  const scheduler = options?.executorTimeoutScheduler ?? defaultExecutorTimeoutScheduler;
  const timeoutMs = resolved.action.timeout_ms;

  const port = deps.registry.getPort(resolved.binding);
  if (!port) {
    const outcome = {
      status: "failed" as const,
      run_id: request.run_id,
      step_id,
      error_code: "EXECUTOR_TYPE_UNSUPPORTED",
      detail: `No adapter for executor type '${resolved.binding.type}'`,
    };
    return buildInvokeResponse(outcome);
  }

  const preflight = await runInvokePreflight(port, resolved, request.space_id);
  if (!preflight.ok) {
    if (preflight.queued) {
      deps.invokeQueue?.enqueue({
        resolved,
        request,
        actor,
        step_id,
        idempotencyKey,
      });
      const outcome = {
        status: "queued" as const,
        run_id: request.run_id,
        step_id,
        detail: preflight.detail,
      };
      if (idempotencyKey && shouldMemoizeOutcome(outcome)) {
        await Promise.resolve(deps.memoStore.set(idempotencyKey, outcome));
      }
      return buildInvokeResponse(outcome);
    }

    await journalInvokeLifecycle(deps.journal, {
      type: JOURNAL_EVENT_TYPES.ACTION_EXECUTOR_UNAVAILABLE,
      space_id: request.space_id,
      session_id: request.session_id,
      run_id: request.run_id,
      step_id,
      action_name: request.action_name,
      actor_id: actor.actor_id,
      token_id: actor.token_id,
      data: withIdempotencyKey({ error_code: preflight.error_code, detail: preflight.detail }, idempotencyKey),
    });

    const outcome = {
      status: "executor_unavailable" as const,
      run_id: request.run_id,
      step_id,
      error_code: preflight.error_code,
      detail: preflight.detail,
    };
    return buildInvokeResponse(outcome);
  }

  const dispatchRequest: InvokeRequest = {
    ...request,
    step_id,
    delivery: resolved.delivery,
    step_contract: request.step_contract,
  };

  const dispatchContext = {
    action: resolved.action,
    binding: resolved.binding,
    space_root: resolved.space_root,
    exec_input: request.exec_input,
    step_contract: request.step_contract,
  };

  const dispatchAudit = port.resolveDispatchAudit
    ? await port.resolveDispatchAudit(dispatchRequest, dispatchContext)
    : undefined;

  const dispatchedData: Record<string, unknown> = {
    executor_type: resolved.binding.type,
  };
  if (dispatchAudit) {
    dispatchedData.command = dispatchAudit.command;
    dispatchedData.prompt = dispatchAudit.prompt;
    dispatchedData.cwd = dispatchAudit.cwd;
  }

  await journalInvokeLifecycle(deps.journal, {
    type: JOURNAL_EVENT_TYPES.ACTION_DISPATCHED,
    space_id: request.space_id,
    session_id: request.session_id,
    run_id: request.run_id,
    step_id,
    action_name: request.action_name,
    actor_id: actor.actor_id,
    token_id: actor.token_id,
    data: withIdempotencyKey(dispatchedData, idempotencyKey),
  });

  if (dispatchAudit && request.run_id) {
    await options?.onDispatchAudit?.({
      run_id: request.run_id,
      step_id,
      audit: dispatchAudit,
    });
  }

  if (request.run_id && timeoutMs) {
    scheduler.start({
      run_id: request.run_id,
      step_id,
      timeout_ms: timeoutMs,
      action_name: request.action_name,
    });
  }

  const outcome = await port.dispatch(dispatchRequest, dispatchContext);

  const normalized = { ...outcome, step_id: outcome.step_id ?? step_id, run_id: outcome.run_id ?? request.run_id };

  if (normalized.status === "queued") {
    deps.invokeQueue?.enqueue({
      resolved,
      request,
      actor,
      step_id,
      idempotencyKey,
    });
  }

  if (normalized.status === "completed") {
    if (
      invokeResultExceedsInlineCap({
        type: JOURNAL_EVENT_TYPES.ACTION_COMPLETED,
        space_id: request.space_id,
        session_id: request.session_id,
        run_id: request.run_id,
        action_name: request.action_name,
        step_id,
        actor_id: actor.actor_id,
        result: normalized.result,
      })
    ) {
      await journalInvokeLifecycle(deps.journal, {
        type: JOURNAL_EVENT_TYPES.ACTION_FAILED,
        space_id: request.space_id,
        session_id: request.session_id,
        run_id: request.run_id,
        step_id,
        action_name: request.action_name,
        actor_id: actor.actor_id,
        token_id: actor.token_id,
        data: withIdempotencyKey(
          {
            error_code: "INLINE_PAYLOAD_EXCEEDED",
            detail: "Action result exceeds 65536 bytes; register output via PUT /v1/artifacts",
          },
          idempotencyKey,
        ),
      });

      const failed = {
        status: "failed" as const,
        run_id: request.run_id,
        step_id,
        error_code: "INLINE_PAYLOAD_EXCEEDED",
        detail: "Action result exceeds 65536 bytes; register output via PUT /v1/artifacts",
      };
      if (idempotencyKey && shouldMemoizeOutcome(failed)) {
        await Promise.resolve(deps.memoStore.set(idempotencyKey, failed));
      }
      if (request.run_id) scheduler.stop(request.run_id, step_id);
      return buildInvokeResponse(failed);
    }

    await journalInvokeLifecycle(deps.journal, {
      type: JOURNAL_EVENT_TYPES.ACTION_COMPLETED,
      space_id: request.space_id,
      session_id: request.session_id,
      run_id: request.run_id,
      step_id,
      action_name: request.action_name,
      actor_id: actor.actor_id,
      token_id: actor.token_id,
      data: withIdempotencyKey({ result: normalized.result }, idempotencyKey),
    });
  }

  if (normalized.status === "failed") {
    await journalInvokeLifecycle(deps.journal, {
      type:
        normalized.error_code === "ACTION_TIMED_OUT"
          ? JOURNAL_EVENT_TYPES.ACTION_TIMED_OUT
          : JOURNAL_EVENT_TYPES.ACTION_FAILED,
      space_id: request.space_id,
      session_id: request.session_id,
      run_id: request.run_id,
      step_id,
      action_name: request.action_name,
      actor_id: actor.actor_id,
      token_id: actor.token_id,
      data: withIdempotencyKey(
        { error_code: normalized.error_code, detail: normalized.detail },
        idempotencyKey,
      ),
    });
    if (request.run_id) scheduler.stop(request.run_id, step_id);
  }

  if (idempotencyKey && shouldMemoizeOutcome(normalized)) {
    await Promise.resolve(deps.memoStore.set(idempotencyKey, normalized));
  }

  return buildInvokeResponse(
    normalized,
    normalized.status === "completed" ? normalized.result : undefined,
  );
}
