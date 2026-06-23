import type { Checkpoint, CheckpointVote } from "@murrmure/runtime-contracts";

export function isQuorumSatisfied(checkpoint: Checkpoint): boolean {
  const approvals = checkpoint.votes.filter((v) => v.decision === "approved").length;
  const { mode, count } = checkpoint.quorum;

  if (mode === "any") return approvals >= count;
  if (mode === "all") return approvals >= checkpoint.quorum.assignees.length;
  if (mode === "count") return approvals >= count;
  return false;
}

export function shouldRejectImmediately(
  checkpoint: Checkpoint,
  reject_requires_quorum?: boolean,
): boolean {
  if (reject_requires_quorum) return false;
  return checkpoint.votes.some((v) => v.decision === "rejected");
}

export function addVote(checkpoint: Checkpoint, vote: CheckpointVote): Checkpoint {
  const existing = checkpoint.votes.findIndex((v) => v.actor_id === vote.actor_id);
  const votes =
    existing >= 0
      ? checkpoint.votes.map((v, i) => (i === existing ? vote : v))
      : [...checkpoint.votes, vote];
  return { ...checkpoint, votes };
}

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
