import type { Checkpoint } from "@murrmure/runtime-contracts";

// The kernel retains a minimal checkpoint *creation* path: a transition whose
// rule declares a `checkpoint` quorum pauses the aggregate (pending) until an
// external resolver advances it. The hub no longer bridges gate.resolve to a
// Removed kernel checkpoint resolve command — gate resolution is owned by the
// orchestration gate service (gates/service) on the gates table. The vote /
// quorum / reject lifecycle helpers that supported the removed checkpoint.resolve
// command have been deleted; only transition→checkpoint construction remains.
export function checkpointFromTransition(
  checkpoint_id: string,
  scope_id: string,
  aggregate_id: string,
  transition: {
    id: string;
    from: string;
    to: string;
    checkpoint: { quorum: "any" | "all" | "count"; count?: number; assignees: string[] };
  },
  ts: string,
): Checkpoint {
  return {
    checkpoint_id,
    aggregate_id,
    scope_id,
    transition_id: transition.id,
    from_state: transition.from,
    to_state: transition.to,
    status: "pending",
    quorum: {
      mode: transition.checkpoint.quorum,
      count: transition.checkpoint.count ?? 1,
      assignees: transition.checkpoint.assignees,
    },
    votes: [],
    created_at: ts,
  };
}
