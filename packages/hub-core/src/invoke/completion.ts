import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { DispatchOutcome, InvokeResponse } from "@murrmure/runtime-contracts";
import type { InvokeJournalWriter } from "./types.js";
import {
  buildSpaceJournalEnvelope,
  InlinePayloadExceededError,
  validateJournalInlinePayload,
} from "../journal/append.js";

export function buildInvokeResponse(outcome: DispatchOutcome, body?: Record<string, unknown>): InvokeResponse {
  return {
    dispatch: outcome,
    ...(body ? { body } : {}),
  };
}

export async function journalInvokeLifecycle(
  journal: InvokeJournalWriter,
  input: {
    type:
      | typeof JOURNAL_EVENT_TYPES.ACTION_DISPATCHED
      | typeof JOURNAL_EVENT_TYPES.ACTION_COMPLETED
      | typeof JOURNAL_EVENT_TYPES.ACTION_FAILED
      | typeof JOURNAL_EVENT_TYPES.ACTION_EXECUTOR_UNAVAILABLE
      | typeof JOURNAL_EVENT_TYPES.ACTION_TIMED_OUT;
    space_id: string;
    session_id?: string;
    run_id?: string;
    step_id: string;
    action_name: string;
    actor_id: string;
    token_id: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await journal.append({
    type: input.type,
    space_id: input.space_id,
    session_id: input.session_id,
    run_id: input.run_id,
    step_id: input.step_id,
    actor_id: input.actor_id,
    token_id: input.token_id,
    data: {
      action_name: input.action_name,
      step_id: input.step_id,
      ...input.data,
    },
  });
}

/** Async completion handler — journal mrmr.action.completed from executor callback. */
export async function completeAsyncInvoke(
  journal: InvokeJournalWriter,
  input: {
    space_id: string;
    session_id?: string;
    run_id?: string;
    step_id: string;
    action_name: string;
    actor_id: string;
    token_id: string;
    result?: Record<string, unknown>;
  },
): Promise<DispatchOutcome> {
  try {
    validateJournalInlinePayload(
      buildSpaceJournalEnvelope({
        space_id: input.space_id,
        type: JOURNAL_EVENT_TYPES.ACTION_COMPLETED,
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
  } catch (error) {
    if (error instanceof InlinePayloadExceededError) {
      await journalInvokeLifecycle(journal, {
        type: JOURNAL_EVENT_TYPES.ACTION_FAILED,
        ...input,
        data: {
          error_code: "INLINE_PAYLOAD_EXCEEDED",
          detail: "Action result exceeds 65536 bytes; register output via PUT /v1/artifacts",
        },
      });
      return {
        status: "failed",
        run_id: input.run_id,
        step_id: input.step_id,
        error_code: "INLINE_PAYLOAD_EXCEEDED",
        detail: "Action result exceeds 65536 bytes; register output via PUT /v1/artifacts",
      };
    }
    throw error;
  }

  await journalInvokeLifecycle(journal, {
    type: JOURNAL_EVENT_TYPES.ACTION_COMPLETED,
    ...input,
    data: { result: input.result },
  });
  return {
    status: "completed",
    run_id: input.run_id,
    step_id: input.step_id,
    result: input.result,
  };
}
