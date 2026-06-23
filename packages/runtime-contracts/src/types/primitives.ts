export type ActorKind = "human" | "agent" | "system";
export type Outcome = "success" | "denial";
export type AggregateStatus = "active" | "terminal" | "archived";
export type CheckpointStatus = "pending" | "resolved" | "rejected";
export type HttpSemantic = 200 | 202 | 400 | 403 | 404 | 409;

export const HTTP_SEMANTIC = {
  OK: 200,
  ACCEPTED: 202,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

export const DENIAL_CODES = {
  POLICY_DENIED: "policy_denied",
  NOT_FOUND: "not_found",
  REVISION_CONFLICT: "revision_conflict",
  TRANSITION_DENIED: "transition_denied",
  TRANSITION_STALE: "transition_stale",
  CHECKPOINT_PENDING: "checkpoint_pending",
  CHECKPOINT_DENIED: "checkpoint_denied",
  CHECKPOINT_ALREADY_RESOLVED: "checkpoint_already_resolved",
  VALIDATION_DENIED: "validation_denied",
  IDEMPOTENCY_REPLAY: "idempotency_replay",
  IDEMPOTENCY_CONFLICT: "idempotency_conflict",
} as const;

export type DenialCode = (typeof DENIAL_CODES)[keyof typeof DENIAL_CODES];
