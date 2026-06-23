import type { InProcessWaitRegistry, WaitResolution } from "@murrmure/runtime-contracts";

export class DeferredWaitRegistry implements InProcessWaitRegistry {
  private readonly deferred = new Map<
    string,
    { resolve: (r: WaitResolution) => void; promise: Promise<WaitResolution> }
  >();

  registerDeferred(wait_id: string): { promise: Promise<WaitResolution> } {
    let resolveFn!: (r: WaitResolution) => void;
    const promise = new Promise<WaitResolution>((resolve) => {
      resolveFn = resolve;
    });
    this.deferred.set(wait_id, { resolve: resolveFn, promise });
    return { promise };
  }

  resolve(wait_id: string, resolution: WaitResolution): void {
    const d = this.deferred.get(wait_id);
    if (d) {
      d.resolve(resolution);
      this.deferred.delete(wait_id);
    }
  }
}
