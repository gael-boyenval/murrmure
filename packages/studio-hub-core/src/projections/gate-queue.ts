import type { JournalEntry } from "@runtime/contracts";

export interface GateQueueState {
  pending: Array<{
    gate_id: string;
    instance_id: string;
    transition_id: string;
    status: string;
  }>;
}

export function gateQueueHandler(
  entry: JournalEntry,
  prior: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const state: GateQueueState = prior
    ? (prior as unknown as GateQueueState)
    : { pending: [] };

  if (entry.type === "checkpoint.created") {
    const cp = entry.payload as { checkpoint_id: string; transition_id: string };
    state.pending.push({
      gate_id: cp.checkpoint_id,
      instance_id: entry.aggregate_id ?? "",
      transition_id: cp.transition_id,
      status: "pending",
    });
  }

  if (entry.type === "checkpoint.resolved") {
    const cp = entry.payload as { checkpoint_id: string; decision: string };
    state.pending = state.pending.filter((g) => g.gate_id !== cp.checkpoint_id);
  }

  return state as unknown as Record<string, unknown>;
}

export function grantInventoryHandler(
  entry: JournalEntry,
  prior: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const grants = ((prior?.grants as unknown[]) ?? []).slice();
  if (entry.type === "grant.minted") {
    grants.push(entry.payload);
  }
  if (entry.type === "grant.revoked") {
    const grant_id = (entry.payload as { grant_id: string }).grant_id;
    const idx = grants.findIndex((g) => (g as { grant_id: string }).grant_id === grant_id);
    if (idx >= 0) grants.splice(idx, 1);
  }
  return { grants, count: grants.length };
}
