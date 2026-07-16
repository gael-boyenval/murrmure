import type { ExecutorBinding } from "./indexed-executor-binding.js";
import type { DispatchAudit, DispatchContext, DispatchOutcome, InvokeRequest } from "../types/invoke.js";

export type Reachability = "reachable" | "unreachable" | "unknown";

export interface ReachabilityResult {
  status: Reachability;
  detail?: string;
}

export interface PreflightContext {
  space_id: string;
}

/** Executor adapter boundary (rev-1 §4.3). */
export interface ExecutorPort {
  preflight(binding: ExecutorBinding, context: PreflightContext): Promise<ReachabilityResult>;
  /** Resolve command/prompt/cwd before dispatch for journal and operator UI. */
  resolveDispatchAudit?(
    invoke: InvokeRequest,
    context: DispatchContext,
  ): Promise<DispatchAudit | undefined>;
  dispatch(invoke: InvokeRequest, context: DispatchContext): Promise<DispatchOutcome>;
  cancel?(invoke: InvokeRequest): Promise<void>;
}

export type { ExecutorBinding } from "./indexed-executor-binding.js";
