/**
 * Per-space async coordination guard shared by run admission and apply.
 *
 * Apply and run start share one guard per space so that:
 *  - admission (count non-terminal runs + insert) is atomic across concurrent
 *    starts — a limit of one never admits two;
 *  - no run observes a partially replaced index — apply holds the same guard
 *    while it builds the candidate and commits the new index.
 *
 * The guard serializes only the brief critical sections (admission+insert for
 * starts, candidate-build+commit for apply); unbounded flows remain concurrent
 * because they are always admitted and the guard is not held across dispatch.
 *
 * In-process single-daemon coordination. Federation/cross-space runs admit in
 * their own space's guard.
 */
export class SpaceConcurrencyGuard {
  private chains = new Map<string, Promise<unknown>>();

  /** Run `fn` while holding the per-space lock. Chains per space. */
  with<T>(spaceId: string, fn: () => Promise<T>): Promise<T> {
    const key = bareSpaceId(spaceId);
    const prev = this.chains.get(key) ?? Promise.resolve();
    const run = prev.then(() => fn());
    // A failed section must not break the chain for the next waiter.
    this.chains.set(key, run.then(noop, noop));
    return run;
  }
}

function noop(): void {
  /* swallow so the chain stays resolved */
}

function bareSpaceId(spaceId: string): string {
  return spaceId.startsWith("spc_") ? spaceId.slice(4) : spaceId;
}

/** Default in-process guard used when a caller does not inject one. */
export const spaceRunGuard = new SpaceConcurrencyGuard();
