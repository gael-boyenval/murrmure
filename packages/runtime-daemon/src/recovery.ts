import type { FanoutDeps } from "@murrmure/runtime-kernel";
import { dispatchFanout } from "@murrmure/runtime-kernel";
import type { PersistencePort } from "@murrmure/runtime-contracts";

export async function drainOutbox(
  persistence: PersistencePort,
  fanoutDeps: FanoutDeps,
  worker_id = "daemon-recovery",
  batchSize = 50,
): Promise<number> {
  let processed = 0;
  while (true) {
    const batch = await persistence.claimFanoutBatch(batchSize, worker_id, 30_000);
    if (batch.length === 0) break;
    for (const entry of batch) {
      try {
        await dispatchFanout([entry], undefined, false, undefined, fanoutDeps);
        await persistence.ackFanout(entry.seq);
        processed += 1;
      } catch (err) {
        const retry = new Date(Date.now() + 5000).toISOString();
        await persistence.failFanout(entry.seq, String(err), retry);
      }
    }
  }
  return processed;
}
