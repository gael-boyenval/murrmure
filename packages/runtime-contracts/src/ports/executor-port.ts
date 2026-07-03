import type { ExecutorBinding } from "./indexed-executor-binding.js";
import type { DispatchContext, DispatchOutcome, InvokeRequest } from "../types/invoke.js";

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
  dispatch(invoke: InvokeRequest, context: DispatchContext): Promise<DispatchOutcome>;
  cancel?(invoke: InvokeRequest): Promise<void>;
}

export type { ExecutorBinding } from "./indexed-executor-binding.js";
