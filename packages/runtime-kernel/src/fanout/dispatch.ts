import type {
  ReactionActionPort,
  CommandResult,
  DeliveryLogEntry,
  JournalEntry,
  NotifyPort,
  PersistencePort,
  ReactionQueueItem,
  ReactionSpec,
  WaitRow,
  WaitResolution,
} from "@murrmure/runtime-contracts";
import { matchesWaitCondition, type CompoundProgress } from "../waiters/match.js";
import { dedupFingerprint, matchesReaction, partitionKey } from "../reactions/matcher.js";
import type { ProjectionHandler } from "../projections/dispatcher.js";
import { dispatchProjection } from "../projections/dispatcher.js";

export interface FanoutDeps {
  persistence: PersistencePort;
  notify: NotifyPort;
  action: ReactionActionPort;
  projectionHandlers: Map<string, ProjectionHandler>;
  compoundProgress: Map<string, CompoundProgress>;
  ids?: { ulid: () => string };
}

export async function dispatchFanout(
  entries: JournalEntry[],
  boundWaitId: string | undefined,
  boundCommandDenied: boolean,
  denialResult: CommandResult | undefined,
  deps: FanoutDeps,
): Promise<void> {
  for (const entry of entries) {
    if (boundWaitId && boundCommandDenied && denialResult) {
      await resolveBoundWait(boundWaitId, denialResult, deps);
      continue;
    }

    const waits = await deps.persistence.listPendingWaits(entry.scope_id, entry.aggregate_id);
    for (const wait of waits) {
      if (wait.bound_command_id && boundCommandDenied && denialResult) {
        await resolveBoundWait(wait.wait_id, denialResult, deps);
        continue;
      }
      const progress = deps.compoundProgress.get(wait.wait_id);
      const result = matchesWaitCondition(wait.condition, entry, progress);
      if (result.progress) deps.compoundProgress.set(wait.wait_id, result.progress);
      if (result.matched) {
        await resolveWait(wait, { status: "matched", wait_id: wait.wait_id, entry }, deps);
      }
    }

    const reactions = await deps.persistence.listReactions(entry.scope_id);
    for (const reaction of reactions) {
      if (!matchesReaction(reaction, entry)) continue;
      await enqueueReactionIfNeeded(reaction, entry, deps);
    }

    for (const [name, handler] of deps.projectionHandlers) {
      await dispatchProjection(name, handler, entry, deps.persistence);
    }
  }

  await drainReactionQueue(deps);
}

async function enqueueReactionIfNeeded(
  reaction: ReactionSpec,
  entry: JournalEntry,
  deps: FanoutDeps,
): Promise<void> {
  const fingerprint = dedupFingerprint(reaction, entry);
  const expires = new Date(Date.now() + reaction.dedup.window_seconds * 1000).toISOString();
  const queue_id = deps.ids?.ulid() ?? `q_${fingerprint.slice(0, 12)}`;

  await deps.persistence.runInTransaction(async (tx) => {
    const dedupResult = await tx.insertDedup(fingerprint, expires);
    if (reaction.dedup.required && dedupResult === "exists") {
      await tx.appendDeliveryLog({
        entry_id: entry.entry_id,
        reaction_id: reaction.reaction_id,
        attempt_no: 1,
        dedup_key: fingerprint,
        outcome: "dedup_skipped",
        ts: entry.ts,
      });
      return;
    }

    const item: ReactionQueueItem = {
      queue_id,
      reaction_id: reaction.reaction_id,
      entry_id: entry.entry_id,
      partition_key: partitionKey(reaction, entry),
      fingerprint,
      attempt_no: 1,
      entry,
      enqueued_at: entry.ts,
    };
    await tx.enqueueReaction(item);
  });
}

export async function drainReactionQueue(deps: FanoutDeps): Promise<void> {
  const batch = await deps.persistence.claimReactionBatch(100);
  for (const item of batch) {
    const reaction = await deps.persistence.getReaction(item.reaction_id);
    if (!reaction) {
      await deps.persistence.completeReaction(item.queue_id, {
        entry_id: item.entry_id,
        reaction_id: item.reaction_id,
        attempt_no: item.attempt_no,
        dedup_key: item.fingerprint,
        outcome: "failed",
        ts: item.entry.ts,
      });
      continue;
    }

    const actionResult = await deps.action.invoke(reaction.action, {
      entry: item.entry,
      reaction_id: reaction.reaction_id,
      attempt_no: item.attempt_no,
    });

    const delivery: DeliveryLogEntry = {
      entry_id: item.entry_id,
      reaction_id: item.reaction_id,
      attempt_no: item.attempt_no,
      dedup_key: item.fingerprint,
      outcome: actionResult.outcome === "success" ? "delivered" : "failed",
      ts: item.entry.ts,
    };
    await deps.persistence.completeReaction(item.queue_id, delivery);
  }
}

async function resolveBoundWait(
  wait_id: string,
  denial: CommandResult,
  deps: FanoutDeps,
): Promise<void> {
  const resolution: WaitResolution = { wait_id, status: "denied", denial };
  await deps.notify.resolveWait(wait_id, resolution);
  const wait = await deps.persistence.runInTransaction((tx) => tx.getWait(wait_id));
  if (wait) {
    await deps.persistence.runInTransaction(async (tx) => {
      await tx.updateWait({ ...wait, status: "resolved" });
    });
  }
}

async function resolveWait(
  wait: WaitRow,
  resolution: WaitResolution,
  deps: FanoutDeps,
): Promise<void> {
  await deps.notify.resolveWait(wait.wait_id, resolution);
  await deps.persistence.runInTransaction(async (tx) => {
    await tx.updateWait({ ...wait, status: "resolved" });
  });
}
