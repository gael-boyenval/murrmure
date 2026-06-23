import type { ReviewSseEvent } from "@studio/review-contracts";

type Listener = (event: ReviewSseEvent) => void;

/** Fan-out for a single session's events; backs both SSE and review-cycle. */
export class SessionHub {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: ReviewSseEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  /** Resolve once an event matching `predicate` is published. */
  waitFor(
    predicate: (event: ReviewSseEvent) => boolean,
    signal?: AbortSignal,
  ): Promise<ReviewSseEvent | null> {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve(null);
      const unsubscribe = this.subscribe((event) => {
        if (predicate(event)) {
          unsubscribe();
          resolve(event);
        }
      });
      signal?.addEventListener(
        "abort",
        () => {
          unsubscribe();
          resolve(null);
        },
        { once: true },
      );
    });
  }
}

export class HubRegistry {
  private readonly hubs = new Map<string, SessionHub>();

  get(key: string): SessionHub {
    let hub = this.hubs.get(key);
    if (!hub) {
      hub = new SessionHub();
      this.hubs.set(key, hub);
    }
    return hub;
  }

  /** Broadcast a shutdown event so blocked review-cycle clients can exit. */
  broadcastShutdown(): void {
    for (const [sessionKey, hub] of this.hubs) {
      hub.publish({ type: "server-shutdown", payload: { sessionKey } });
    }
  }
}

export const hubs = new HubRegistry();
