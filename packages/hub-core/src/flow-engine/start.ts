import type { Capability, FlowIndexEntry, FlowStartEvent } from "@murrmure/contracts";
import { canStartFlow, hasCapability } from "../grants/migrate.js";
import type { FlowStartError, FlowStepDispatch } from "./types.js";
export type { FlowStartError } from "./types.js";
import { buildStepDispatch } from "./advance.js";
import { firstDispatchableStep } from "./plan.js";

export function canReadFlow(capabilities: Capability[]): boolean {
  return hasCapability(capabilities, ["flow:read", "flow:run"]);
}

export function canExecuteFlow(
  capabilities: Capability[],
  flow_acl: string[] | undefined,
  flow_id: string,
): boolean {
  if (!canStartFlow(capabilities)) return false;
  if (!flow_acl?.length) return true;
  return flow_acl.includes(flow_id);
}

export function isManualStartAllowed(entry: FlowIndexEntry): boolean {
  return entry.triggers.manual === true;
}

/**
 * Whether the flow advertises `flow_call` as a start trigger. This is an
 * advertisement/surfacing predicate only: authorized orchestration invocation
 * (`flow_call` / `start_flow` from a parent run with `flow:run`) remains valid
 * for *every* flow, including invoke-only `triggers: {}` flows, and is gated by
 * authorization (`canExecuteFlow`), not by this flag.
 */
export function isFlowCallStartAllowed(entry: FlowIndexEntry): boolean {
  return entry.triggers.flow_call === true;
}

export function matchesFlowStartEvent(
  entry: FlowIndexEntry,
  event: { type: string; source?: string },
): boolean {
  const events = entry.triggers.events ?? [];
  return events.some((spec: FlowStartEvent) => {
    if (spec.type !== event.type) return false;
    if (spec.source && event.source && spec.source !== event.source) return false;
    return true;
  });
}

export function buildRunKey(
  entry: FlowIndexEntry,
  input: Record<string, unknown>,
  idempotencyHeader?: string,
): string | undefined {
  if (entry.triggers.idempotency !== "run_key") return undefined;
  if (idempotencyHeader) return idempotencyHeader;
  return `run_key:${entry.flow_id}:${JSON.stringify(input)}`;
}

export interface FlowPrepareResult {
  flow_digest: string;
  dispatch: FlowStepDispatch[];
}

export function prepareFlowStart(
  entry: FlowIndexEntry,
  input: {
    exec_context: Record<string, unknown>;
    origin_space_id: string;
    capabilities: Capability[];
    flow_acl?: string[];
    mode: "manual" | "event" | "schedule" | "flow_call";
  },
): FlowPrepareResult | FlowStartError {
  if (!entry.ir) {
    return { code: "FLOW_IR_MISSING", message: "Flow has no compiled IR — re-run space apply" };
  }

  if (input.mode === "event") {
    const eventType = String(input.exec_context._event_type ?? "");
    const eventSource = input.exec_context._event_source
      ? String(input.exec_context._event_source)
      : undefined;
    if (!matchesFlowStartEvent(entry, { type: eventType, source: eventSource })) {
      return { code: "EVENT_MISMATCH", message: "Event does not match flow start conditions" };
    }
  }

  if (input.mode === "manual" && !isManualStartAllowed(entry)) {
    return { code: "MANUAL_START_DISABLED", message: "Flow does not allow manual start" };
  }

  // `flow_call` mode is authorized orchestration invocation (a parent run
  // invoking a child via `start_flow`). It remains valid for invoke-only
  // `triggers: {}` flows; authorization is enforced by `canExecuteFlow` below
  // and by `canInvokeFlowCall` at the call site — not by `triggers.flow_call`.

  if (!canExecuteFlow(input.capabilities, input.flow_acl, entry.flow_id)) {
    return { code: "SCOPE_ENFORCEMENT_FAILURE", message: "Grant lacks flow:run for this flow" };
  }

  const dispatch: FlowStepDispatch[] = [];
  const first = firstDispatchableStep(entry.ir);
  if (first) {
    const stepDispatch = buildStepDispatch(entry.ir, 0, input.exec_context, input.origin_space_id);
    if (stepDispatch) dispatch.push(stepDispatch);
  }

  return {
    flow_digest: entry.digest,
    dispatch,
  };
}

export function sanitizeFlowPreview(entry: FlowIndexEntry) {
  return {
    flow_id: entry.flow_id,
    name: entry.name,
    digest: entry.digest,
    triggers: {
      manual: entry.triggers.manual,
      flow_call: entry.triggers.flow_call,
      events: entry.triggers.events,
      schedule: entry.triggers.schedule ?? null,
    },
  };
}
