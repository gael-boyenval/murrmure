import type { CommandResult } from "@runtime/contracts";
import { STUDIO_DENIAL_CODES } from "@studio/contracts";

const KERNEL_TO_STUDIO: Record<string, string> = {
  policy_denied: STUDIO_DENIAL_CODES.TOKEN_DENIED,
  scope_denied: STUDIO_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE,
  transition_denied: STUDIO_DENIAL_CODES.TRANSITION_DENIED,
  checkpoint_vote_denied: STUDIO_DENIAL_CODES.GATE_RESOLUTION_DENIED,
  validation_denied: STUDIO_DENIAL_CODES.CONTRACT_VALIDATION_DENIED,
  checkpoint_pending: "checkpoint_pending",
  aggregate_created: "aggregate_created",
  state_transitioned: "state_transitioned",
  checkpoint_resolved: "checkpoint_resolved",
  wait_registered: "wait_registered",
};

export function mapKernelResult(result: CommandResult, hint?: { nearest_space_id?: string }) {
  const code = KERNEL_TO_STUDIO[result.code] ?? result.code;
  const body = { ...result.body };
  if (hint?.nearest_space_id && code === STUDIO_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE) {
    body.hint = { nearest_space_id: hint.nearest_space_id };
  }
  return { ...result, code, body };
}

export function scopeEnforcementDenial(hint?: { nearest_space_id?: string }): CommandResult {
  return {
    outcome: "denial",
    http_semantic: 403,
    code: STUDIO_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE,
    body: hint ? { hint } : {},
  };
}

export function harnessMismatchDenial(): CommandResult {
  return {
    outcome: "denial",
    http_semantic: 403,
    code: STUDIO_DENIAL_CODES.HARNESS_MISMATCH,
    body: { message: "Token harness does not match caller claim" },
  };
}
