/** rev-1 §8.2 normative starter journal event types. */
export const JOURNAL_EVENT_TYPES = {
  SESSION_CREATED: "mrmr.session.created",
  SESSION_CANCEL_REQUESTED: "mrmr.session.cancel_requested",
  RUN_STARTED: "mrmr.run.started",
  RUN_COMPLETED: "mrmr.run.completed",
  RUN_FAILED: "mrmr.run.failed",
  ACTION_DISPATCHED: "mrmr.action.dispatched",
  ACTION_COMPLETED: "mrmr.action.completed",
  ACTION_FAILED: "mrmr.action.failed",
  ACTION_TIMED_OUT: "mrmr.action.timed_out",
  ACTION_EXECUTOR_UNAVAILABLE: "mrmr.action.executor_unavailable",
  GATE_PENDING: "mrmr.gate.pending",
  GATE_RESOLVED: "mrmr.gate.resolved",
  STEP_OPENED: "mrmr.step.opened",
  STEP_RESOLVED: "mrmr.step.resolved",
  ARTIFACT_TRANSFERRED: "mrmr.artifact.transferred",
  ARTIFACT_EXPIRED: "mrmr.artifact.expired",
  HOOK_DELIVERED: "mrmr.hook.delivered",
  FLOW_ATTACHED: "mrmr.flow.attached",
  FLOW_CHILD_STARTED: "mrmr.flow.child_started",
  FLOW_CHILD_COMPLETED: "mrmr.flow.child_completed",
  FLOW_START_DENIED: "mrmr.flow.start_denied",
  SPACE_INDEX_UPDATED: "mrmr.space.index_updated",
} as const;

export type JournalEventType = (typeof JOURNAL_EVENT_TYPES)[keyof typeof JOURNAL_EVENT_TYPES];

export const JOURNAL_EVENT_TYPE_LIST = Object.values(JOURNAL_EVENT_TYPES);
