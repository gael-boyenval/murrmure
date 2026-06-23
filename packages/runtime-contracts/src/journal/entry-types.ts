export const ENTRY_TYPES = {
  AGGREGATE_CREATED: "aggregate.created",
  TRANSITION_APPLIED: "transition.applied",
  TRANSITION_DENIED: "transition.denied",
  POLICY_DENIED: "policy.denied",
  REVISION_CONFLICT: "revision.conflict",
  VALIDATION_DENIED: "validation.denied",
  CHECKPOINT_CREATED: "checkpoint.created",
  CHECKPOINT_VOTE: "checkpoint.vote",
  CHECKPOINT_RESOLVED: "checkpoint.resolved",
  CHECKPOINT_REJECTED: "checkpoint.rejected",
  EVENT_APPENDED: "event.appended",
  WAIT_REGISTERED: "wait.registered",
  WAIT_CANCELLED: "wait.cancelled",
  REACTION_REGISTERED: "reaction.registered",
  REACTION_DISABLED: "reaction.disabled",
} as const;

export const STATE_MUTATING_TYPES = new Set([
  ENTRY_TYPES.AGGREGATE_CREATED,
  ENTRY_TYPES.TRANSITION_APPLIED,
]);
